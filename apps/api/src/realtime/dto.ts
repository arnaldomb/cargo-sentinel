/**
 * DTO builders for the real-time feed.
 *
 * Centralizes mapping from Prisma model shape to stable wire types used
 * by both the REST feed endpoint and the Socket.IO emissions.
 */

export type FeedItem = {
  id: string;
  timestamp: string;
  placaId: string | null;
  placaNumero: string;
  classificacao: string;
  direcao: 'ENTRADA' | 'SAIDA' | null;
  thumbnailUrl: string | null;
  obra: { id: string; nome: string };
  camera: { id: string; codigoLpr: string };
};

export type CameraStatusItem = {
  id: string;
  codigoLpr: string;
  ip: string | null;
  obra: { id: string; nome: string };
  ultimoEventoEm: string | null;
  status: 'online' | 'offline';
};

/**
 * Maps a raw Evento row (with obra/camera relations) to the stable FeedItem DTO.
 * thumbnailUrl must be resolved by the caller (presigned URL generation is async).
 */
export function eventoToFeedItem(
  evento: {
    id: string;
    timestamp: Date;
    placaId: string | null;
    placaNumero: string;
    classificacao: string;
    direcao: 'ENTRADA' | 'SAIDA' | null;
    obra: { id: string; nome: string };
    camera: { id: string; codigoLpr: string };
  },
  thumbnailUrl: string | null,
): FeedItem {
  return {
    id: evento.id,
    timestamp: evento.timestamp.toISOString(),
    placaId: evento.placaId,
    placaNumero: evento.placaNumero,
    classificacao: evento.classificacao,
    direcao: evento.direcao,
    thumbnailUrl,
    obra: evento.obra,
    camera: evento.camera,
  };
}

/**
 * DTO for cross-site alert events emitted via Socket.IO.
 * INTEL-03: payload must include plate, classification, detected obra, and original obra.
 * Consumed by frontend dashboard-client.tsx for overlay rendering (Plan 04-04).
 */
export type CrossSiteAlertDTO = {
  empresaId: string;
  placaNumero: string;
  classificacao: 'SUSPEITO' | 'CRITICO';
  obraDetectadaId: string;
  obraDetectadaNome: string;
  obraClassificacaoId: string;
  obraClassificacaoNome: string;
  eventoId: string;
  timestamp: string;
};

/**
 * DTO emitido via Socket.IO quando relatório async fica pronto.
 * REPORTS-06: WebSocket notification quando arquivo está pronto para download.
 */
export type RelatorioProntoDTO = {
  relatorioId: string;
  formato: 'PDF' | 'XLSX';
  downloadUrl: string;   // presigned URL 1h (REPORTS-07)
  expiresAt: string;     // ISO string de validade
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Calculates online/offline status for a camera based on the timestamp
 * of its most recent event. "online" = last event within the past 5 minutes.
 */
export function calcCameraStatus(
  camera: {
    id: string;
    codigoLpr: string;
    ip: string | null;
    obra: { id: string; nome: string };
  },
  ultimoEvento: Date | null,
  now: Date = new Date(),
): CameraStatusItem {
  const ultimoEventoEm = ultimoEvento ? ultimoEvento.toISOString() : null;
  const status: 'online' | 'offline' =
    ultimoEvento && now.getTime() - ultimoEvento.getTime() <= ONLINE_WINDOW_MS
      ? 'online'
      : 'offline';

  return {
    id: camera.id,
    codigoLpr: camera.codigoLpr,
    ip: camera.ip,
    obra: camera.obra,
    ultimoEventoEm,
    status,
  };
}
