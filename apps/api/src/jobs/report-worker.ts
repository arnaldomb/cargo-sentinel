import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from '../services/redis';
import { prisma } from '@cargo-sentinel/database';
import { getPresignedUrl } from '../services/garage';
import {
  generatePDF,
  generateXLSX,
  uploadReportToGarage,
  getReportPresignedUrl,
  type ReportEvento,
  type ReportFiltrosDisplay,
} from '../services/report-generator';
import { emitRelatorioPronto } from '../realtime/server';

/**
 * Job payload gravado no Redis pelo route handler (plan 06-03).
 */
export type ReportJobPayload = {
  relatorioId: string;
  empresaId: string;
  formato: 'PDF' | 'XLSX';
  filtros: {
    dataInicio?: string;    // ISO string
    dataFim?: string;       // ISO string
    obraId?: string;
    cameraId?: string;
    classificacao?: string; // Classificacao enum value
    placa?: string;         // partial match
  };
  criadoPor: string;        // userId
};

// ============================================================
// Helpers internos
// ============================================================

const MAX_EVENTS = 1000; // REPORTS-05

/**
 * Faz download de thumbnail via presigned URL e retorna Buffer.
 * Retorna null se a chave for nula ou o download falhar.
 * Timeout 5s — thumbnail indisponível não quebra o relatório.
 */
async function fetchThumbnailBuffer(key: string | null): Promise<Buffer | null> {
  if (!key) return null;
  try {
    const presigned = await getPresignedUrl(key); // TTL 5min — suficiente para geração local
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(presigned, { signal: controller.signal });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null; // thumbnail indisponível não bloqueia o relatório
  }
}

// ============================================================
// Processador principal
// ============================================================

async function processReportJob(job: Job<ReportJobPayload>): Promise<void> {
  const { relatorioId, empresaId, formato, filtros } = job.data;

  // Validação de segurança: confirmar que o relatorio pertence ao empresaId do payload (T-06-04)
  const relatorio = await prisma.relatorio.findUnique({ where: { id: relatorioId } });
  if (!relatorio || relatorio.empresaId !== empresaId) {
    throw new Error(`Relatorio ${relatorioId} não encontrado ou tenant mismatch`);
  }

  // Marcar como PROCESSANDO
  await prisma.relatorio.update({
    where: { id: relatorioId },
    data: { status: 'PROCESSANDO' },
  });

  try {
    // --- Buscar dados da empresa ---
    const empresa = await prisma.empresa.findUniqueOrThrow({
      where: { id: empresaId },
      select: { nome: true },
    });

    // Resolver nomes de obra/câmera para o cabeçalho do relatório
    let obraNome: string | undefined;
    let cameraCodigo: string | undefined;

    if (filtros.obraId) {
      const obra = await prisma.obra.findUnique({
        where: { id: filtros.obraId },
        select: { nome: true },
      });
      obraNome = obra?.nome;
    }
    if (filtros.cameraId) {
      const camera = await prisma.camera.findUnique({
        where: { id: filtros.cameraId },
        select: { codigoLpr: true },
      });
      cameraCodigo = camera?.codigoLpr;
    }

    // Construir where idêntico ao padrão de eventos.ts (REPORTS-04)
    const where = {
      empresaId, // CRÍTICO: sempre filtrar por tenant (T-06-04)
      ...(filtros.placa && {
        placaNumero: { contains: filtros.placa, mode: 'insensitive' as const },
      }),
      ...(filtros.obraId && { obraId: filtros.obraId }),
      ...(filtros.cameraId && { cameraId: filtros.cameraId }),
      ...(filtros.classificacao && { classificacao: filtros.classificacao as never }),
      ...((filtros.dataInicio || filtros.dataFim) && {
        timestamp: {
          ...(filtros.dataInicio && { gte: new Date(filtros.dataInicio) }),
          ...(filtros.dataFim    && { lte: new Date(filtros.dataFim) }),
        },
      }),
    };

    // REPORTS-05: máximo 1.000 eventos
    const rawEventos = await prisma.evento.findMany({
      where,
      take: MAX_EVENTS,
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        timestamp: true,
        placaNumero: true,
        classificacao: true,
        direcao: true,
        fotoGarageKey: true,
        obra: { select: { nome: true } },
        camera: { select: { codigoLpr: true } },
      },
    });

    // Buscar thumbnails em paralelo com concorrência limitada (T-06-05: max 10 simultâneas)
    const THUMB_CONCURRENCY = 10;
    const eventos: ReportEvento[] = [];

    for (let i = 0; i < rawEventos.length; i += THUMB_CONCURRENCY) {
      const batch = rawEventos.slice(i, i + THUMB_CONCURRENCY);
      const buffers = await Promise.all(
        batch.map((e) => fetchThumbnailBuffer(e.fotoGarageKey)),
      );
      batch.forEach((e, idx) => {
        eventos.push({
          ...e,
          classificacao: String(e.classificacao),
          direcao: e.direcao as 'ENTRADA' | 'SAIDA' | null,
          thumbnailPresignedUrl: e.fotoGarageKey ? 'fetched' : null,
          _thumbnailBuffer: buffers[idx] ?? undefined,
        });
      });
    }

    const filtrosDisplay: ReportFiltrosDisplay = {
      dataInicio: filtros.dataInicio,
      dataFim: filtros.dataFim,
      obra: obraNome,
      camera: cameraCodigo,
      classificacao: filtros.classificacao,
      placa: filtros.placa,
    };

    // --- Gerar arquivo ---
    let fileBuffer: Buffer;
    if (formato === 'PDF') {
      fileBuffer = await generatePDF(eventos, filtrosDisplay, empresa.nome);
    } else {
      fileBuffer = await generateXLSX(eventos, filtrosDisplay, empresa.nome);
    }

    // --- Upload ao Garage ---
    const garageKey = await uploadReportToGarage(fileBuffer, empresaId, relatorioId, formato);

    // --- Marcar como PRONTO ---
    const expiresAt = new Date(Date.now() + 3600 * 1000); // +1h (REPORTS-07)
    await prisma.relatorio.update({
      where: { id: relatorioId },
      data: { status: 'PRONTO', garageKey, expiresAt },
    });

    // --- Gerar presigned URL e emitir evento Socket.IO (REPORTS-06) ---
    const downloadUrl = await getReportPresignedUrl(garageKey); // TTL 3600s

    emitRelatorioPronto(empresaId, {
      relatorioId,
      formato,
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
    });

  } catch (err) {
    const erroMsg = err instanceof Error ? err.message : String(err);
    await prisma.relatorio.update({
      where: { id: relatorioId },
      data: { status: 'ERRO', erroMsg },
    });
    throw err; // re-throw para BullMQ registrar a falha e tentar novamente
  }
}

// ============================================================
// Bootstrap do worker
// ============================================================

let workerInstance: Worker | null = null;

/**
 * Starts the report worker with concurrency 2.
 * Call once from app bootstrap (src/index.ts).
 * Replaces the stub from plan 06-01.
 */
export function startReportWorker(): Worker {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker<ReportJobPayload>('report-jobs', processReportJob, {
    connection: createRedisConnection(),
    concurrency: 2, // 2 relatórios em paralelo sem sobrecarga de memória (T-06-08)
  });

  workerInstance.on('completed', (job) => {
    console.log(`[report-worker] job ${job.id} (relatorio ${job.data.relatorioId}) concluído`);
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`[report-worker] job ${job?.id} falhou:`, err.message);
  });

  return workerInstance;
}
