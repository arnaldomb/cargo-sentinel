import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from '../services/redis';

/**
 * Job payload for report generation.
 * Enqueued by POST /api/relatorios and consumed here.
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

/**
 * Processes a report generation job (REPORTS-01).
 * Stub: marks job as processing then throws NotImplemented.
 * Will be replaced by full implementation in plan 06-02.
 */
async function processReportJob(job: Job<ReportJobPayload>): Promise<void> {
  const { relatorioId } = job.data;
  console.log(`[report-worker] processando relatorio ${relatorioId} — stub`);
  // Implementação completa no plan 06-02
  throw new Error(`report-worker stub: relatorio ${relatorioId} não implementado ainda`);
}

let workerInstance: Worker | null = null;

/**
 * Starts the report worker with concurrency 2.
 * Call once from app bootstrap (src/index.ts).
 */
export function startReportWorker(): Worker {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker<ReportJobPayload>('report-jobs', processReportJob, {
    connection: createRedisConnection(),
    concurrency: 2,
  });

  workerInstance.on('completed', (job) => {
    console.log(`[report-worker] job ${job.id} concluído`);
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`[report-worker] job ${job?.id} falhou:`, err.message);
  });

  return workerInstance;
}
