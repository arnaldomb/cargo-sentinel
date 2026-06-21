import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ============================================================
// Cores por classificação (REPORTS-03 / REALTIME-04)
// ============================================================
const CLASSIFICATION_COLORS: Record<string, { bg: string; text: string }> = {
  LIBERADO:  { bg: '#dcfce7', text: '#15803d' },
  VISITANTE: { bg: '#f3f4f6', text: '#374151' },
  ATENCAO:   { bg: '#fef9c3', text: '#92400e' },
  SUSPEITO:  { bg: '#ffedd5', text: '#9a3412' },
  CRITICO:   { bg: '#fee2e2', text: '#991b1b' },
};

const REPORT_BUCKET = 'lpr-images'; // mesmo bucket — pasta separada via prefixo reports/

// Cliente interno para upload (nunca URL pública)
const internalS3 = new S3Client({
  region: 'garage',
  endpoint: process.env.GARAGE_INTERNAL_URL ?? 'http://garage:3900',
  credentials: {
    accessKeyId: process.env.GARAGE_ACCESS_KEY!,
    secretAccessKey: process.env.GARAGE_SECRET_KEY!,
  },
  forcePathStyle: true,
});

// ============================================================
// Helpers
// ============================================================

/**
 * Faz download de uma imagem via presigned URL e retorna Buffer.
 * Usa fetch nativo do Node 24 — sem node-fetch.
 * Retorna null se URL for nula ou download falhar (não quebra o relatório).
 */
export async function fetchImageBuffer(presignedUrl: string | null): Promise<Buffer | null> {
  if (!presignedUrl) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(presignedUrl, { signal: controller.signal });
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

/**
 * Faz upload do buffer gerado ao Garage.
 * Chave: reports/{empresaId}/{relatorioId}.pdf ou .xlsx
 * Retorna a chave (nunca URL).
 */
export async function uploadReportToGarage(
  buffer: Buffer,
  empresaId: string,
  relatorioId: string,
  formato: 'PDF' | 'XLSX',
): Promise<string> {
  const ext = formato === 'PDF' ? 'pdf' : 'xlsx';
  const key = `reports/${empresaId}/${relatorioId}.${ext}`;
  const contentType =
    formato === 'PDF'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  await internalS3.send(
    new PutObjectCommand({
      Bucket: REPORT_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return key;
}

/**
 * Gera presigned URL pública para o relatório.
 * TTL: 3600s (1 hora) — REPORTS-07.
 * CRÍTICO: assinar com GARAGE_SERVER_URL (público), não GARAGE_INTERNAL_URL.
 */
export async function getReportPresignedUrl(key: string): Promise<string> {
  const publicS3 = new S3Client({
    region: 'garage',
    endpoint: process.env.GARAGE_SERVER_URL,
    credentials: {
      accessKeyId: process.env.GARAGE_ACCESS_KEY!,
      secretAccessKey: process.env.GARAGE_SECRET_KEY!,
    },
    forcePathStyle: true,
  });

  return getSignedUrl(publicS3, new GetObjectCommand({ Bucket: REPORT_BUCKET, Key: key }), {
    expiresIn: 3600, // REPORTS-07: link expira em 1 hora
  });
}

// ============================================================
// Tipo compartilhado de evento para geração
// ============================================================
export type ReportEvento = {
  id: string;
  timestamp: Date;
  placaNumero: string;
  classificacao: string;
  direcao: 'ENTRADA' | 'SAIDA' | null;
  fotoGarageKey: string | null;
  thumbnailPresignedUrl: string | null; // indicador de que thumbnail foi tentado
  _thumbnailBuffer?: Buffer;            // buffer real para embutir em PDF/XLSX
  obra: { nome: string };
  camera: { codigoLpr: string };
};

export type ReportFiltrosDisplay = {
  dataInicio?: string;
  dataFim?: string;
  obra?: string;         // nome da obra, não ID
  camera?: string;       // codigoLpr, não ID
  classificacao?: string;
  placa?: string;
};

// ============================================================
// PDF — pdfkit (sem Puppeteer, sem Chrome no Docker)
// ============================================================

/**
 * Gera PDF com:
 * - Cabeçalho com filtros ativos (REPORTS-02)
 * - Tabela de eventos com foto thumbnail em cada linha (REPORTS-02)
 * - Sem Puppeteer — pdfkit puro (Node.js, zero dependência de Chrome)
 */
export async function generatePDF(
  eventos: ReportEvento[],
  filtros: ReportFiltrosDisplay,
  empresaNome: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // --- Cabeçalho ---
    doc.fontSize(16).font('Helvetica-Bold').text('Cargo Sentinel — Relatório de Eventos', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Empresa: ${empresaNome}`, { align: 'center' });
    doc.moveDown(0.5);

    // Filtros ativos
    const filtroLines: string[] = [];
    if (filtros.dataInicio)    filtroLines.push(`De: ${filtros.dataInicio}`);
    if (filtros.dataFim)       filtroLines.push(`Até: ${filtros.dataFim}`);
    if (filtros.obra)          filtroLines.push(`Obra: ${filtros.obra}`);
    if (filtros.camera)        filtroLines.push(`Câmera: ${filtros.camera}`);
    if (filtros.classificacao) filtroLines.push(`Classificação: ${filtros.classificacao}`);
    if (filtros.placa)         filtroLines.push(`Placa: ${filtros.placa}`);
    if (filtroLines.length > 0) {
      doc.fontSize(9).text(`Filtros: ${filtroLines.join(' | ')}`);
    }
    doc.fontSize(9).text(`Total de eventos: ${eventos.length} (máx. 1.000)`);
    doc.moveDown(1);

    // --- Cabeçalho da tabela ---
    const COL = { foto: 30, placa: 120, obra: 230, camera: 340, dir: 420, class: 490, hora: 570 };
    const ROW_H = 45;
    const PAGE_W = doc.page.width - 60;

    doc.fontSize(8).font('Helvetica-Bold');
    const headerY = doc.y;
    doc.text('Foto',          COL.foto,   headerY, { width: 80, continued: true });
    doc.text('Placa',         COL.placa,  headerY, { width: 100, continued: true });
    doc.text('Obra',          COL.obra,   headerY, { width: 100, continued: true });
    doc.text('Câmera',        COL.camera, headerY, { width: 70, continued: true });
    doc.text('Direção',       COL.dir,    headerY, { width: 60, continued: true });
    doc.text('Classificação', COL.class,  headerY, { width: 70, continued: true });
    doc.text('Horário',       COL.hora,   headerY, { width: 90 });
    doc.moveTo(30, doc.y).lineTo(PAGE_W + 30, doc.y).stroke();
    doc.moveDown(0.3);

    // --- Linhas de eventos ---
    doc.font('Helvetica').fontSize(7);

    for (const evento of eventos) {
      const colors = CLASSIFICATION_COLORS[evento.classificacao] ?? CLASSIFICATION_COLORS['VISITANTE']!;
      const rowY = doc.y;

      // Fundo colorido por classificação
      doc.rect(30, rowY - 2, PAGE_W, ROW_H).fill(colors.bg).stroke('#e5e7eb');

      // Thumbnail embutido
      if (evento._thumbnailBuffer) {
        try {
          doc.image(evento._thumbnailBuffer, COL.foto, rowY + 2, { width: 55, height: ROW_H - 8 });
        } catch {
          // Imagem corrompida — pular silenciosamente
        }
      }

      doc.fillColor(colors.text);
      doc.text(evento.placaNumero,                                COL.placa,  rowY + 4, { width: 100 });
      doc.text(evento.obra.nome,                                  COL.obra,   rowY + 4, { width: 100 });
      doc.text(evento.camera.codigoLpr,                           COL.camera, rowY + 4, { width: 70 });
      doc.text(evento.direcao ?? '—',                             COL.dir,    rowY + 4, { width: 60 });
      doc.text(evento.classificacao,                              COL.class,  rowY + 4, { width: 70 });
      doc.text(new Date(evento.timestamp).toLocaleString('pt-BR'),COL.hora,   rowY + 4, { width: 90 });

      doc.fillColor('#000000');
      doc.y = rowY + ROW_H + 2;

      // Nova página se necessário
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
      }
    }

    doc.end();
  });
}

// ============================================================
// Excel — ExcelJS com imagens embutidas (REPORTS-03)
// ============================================================

/**
 * Gera Excel com:
 * - Linha de cabeçalho estilizada
 * - Imagem embutida por linha na coluna A (REPORTS-03)
 * - Linhas coloridas por classificação (REPORTS-03)
 */
export async function generateXLSX(
  eventos: ReportEvento[],
  filtros: ReportFiltrosDisplay,
  empresaNome: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Cargo Sentinel';

  const ws = wb.addWorksheet('Eventos', {
    pageSetup: { orientation: 'landscape', fitToPage: true },
  });

  // Largura das colunas
  ws.columns = [
    { key: 'foto',         width: 14 },
    { key: 'placa',        width: 14 },
    { key: 'obra',         width: 24 },
    { key: 'camera',       width: 14 },
    { key: 'direcao',      width: 12 },
    { key: 'classificacao',width: 16 },
    { key: 'horario',      width: 22 },
  ];

  // Linha de título
  ws.mergeCells('A1:G1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `Cargo Sentinel — Relatório de Eventos — ${empresaNome}`;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: 'center' };

  // Filtros aplicados
  const filtroLines: string[] = [];
  if (filtros.dataInicio)    filtroLines.push(`De: ${filtros.dataInicio}`);
  if (filtros.dataFim)       filtroLines.push(`Até: ${filtros.dataFim}`);
  if (filtros.obra)          filtroLines.push(`Obra: ${filtros.obra}`);
  if (filtros.camera)        filtroLines.push(`Câmera: ${filtros.camera}`);
  if (filtros.classificacao) filtroLines.push(`Classificação: ${filtros.classificacao}`);
  if (filtros.placa)         filtroLines.push(`Placa: ${filtros.placa}`);

  ws.mergeCells('A2:G2');
  ws.getCell('A2').value = filtroLines.length > 0
    ? `Filtros: ${filtroLines.join(' | ')}`
    : 'Sem filtros aplicados';
  ws.getCell('A2').font = { size: 9, italic: true };

  ws.mergeCells('A3:G3');
  ws.getCell('A3').value = `Total: ${eventos.length} eventos (máx. 1.000)`;
  ws.getCell('A3').font = { size: 9 };

  // Linha de cabeçalho da tabela (row 4)
  const headerRow = ws.getRow(4);
  headerRow.values = ['Foto', 'Placa', 'Obra', 'Câmera', 'Direção', 'Classificação', 'Horário'];
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003366' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 20;

  // Linhas de dados (a partir da row 5)
  let excelRow = 5;

  for (const evento of eventos) {
    const colors = CLASSIFICATION_COLORS[evento.classificacao] ?? CLASSIFICATION_COLORS['VISITANTE']!;
    const bgArgb = 'FF' + colors.bg.replace('#', '').toUpperCase();
    const textArgb = 'FF' + colors.text.replace('#', '').toUpperCase();

    const row = ws.getRow(excelRow);
    row.height = 55; // altura para acomodar thumbnail

    // Helper para estilizar célula
    const setCellStyled = (col: number, value: string) => {
      const cell = row.getCell(col);
      cell.value = value;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
      cell.font = { color: { argb: textArgb }, size: 9 };
      cell.alignment = { vertical: 'middle', wrapText: true };
    };

    // Coluna A (foto) — preenchida com cor de fundo; imagem adicionada abaixo
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };

    setCellStyled(2, evento.placaNumero);
    setCellStyled(3, evento.obra.nome);
    setCellStyled(4, evento.camera.codigoLpr);
    setCellStyled(5, evento.direcao ?? '—');
    setCellStyled(6, evento.classificacao);
    setCellStyled(7, new Date(evento.timestamp).toLocaleString('pt-BR'));

    // Embutir thumbnail na célula A (REPORTS-03)
    if (evento._thumbnailBuffer) {
      try {
        // Cast necessário: ExcelJS Image.buffer espera Buffer sem generic,
        // mas Node 20+ infere Buffer<ArrayBufferLike>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const imageId = wb.addImage({ buffer: evento._thumbnailBuffer as any, extension: 'jpeg' });
        ws.addImage(imageId, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tl: { col: 0, row: excelRow - 1 } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          br: { col: 1, row: excelRow } as any,
          editAs: 'oneCell',
        });
      } catch {
        // Imagem corrompida — pular
      }
    }

    excelRow++;
  }

  // Auto-filter na linha de cabeçalho
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 7 } };

  const rawBuffer = await wb.xlsx.writeBuffer();
  // writeBuffer pode retornar ArrayBuffer em algumas versões — normalizar para Buffer
  return Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer as ArrayBuffer);
}
