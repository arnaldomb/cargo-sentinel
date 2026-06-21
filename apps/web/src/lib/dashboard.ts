export type FeedItem = {
  id: string;
  timestamp: string;
  placaId: string | null;
  placaNumero: string;
  classificacao: 'LIBERADO' | 'VISITANTE' | 'ATENCAO' | 'SUSPEITO' | 'CRITICO';
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

export function resolveApiBaseUrl(
  hostname: string | undefined,
  protocol = 'http:',
  envBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL,
): string {
  if (envBaseUrl) return envBaseUrl;
  if (!hostname) return 'http://localhost:4000';
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:4000`;
  }
  return '';
}

export function requiresCriticalConfirmation(
  classificacao: FeedItem['classificacao'],
): boolean {
  return classificacao === 'SUSPEITO' || classificacao === 'CRITICO';
}

export function upsertFeedItem(items: FeedItem[], incoming: FeedItem): FeedItem[] {
  const filtered = items.filter((item) => item.id !== incoming.id);
  return [incoming, ...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function updateFeedClassification(
  items: FeedItem[],
  update: {
    placaId: string;
    classificacao: FeedItem['classificacao'];
  },
): FeedItem[] {
  return items.map((item) =>
    item.placaId === update.placaId
      ? { ...item, classificacao: update.classificacao }
      : item,
  );
}

export function upsertCameraStatus(
  items: CameraStatusItem[],
  incoming: CameraStatusItem,
): CameraStatusItem[] {
  const filtered = items.filter((item) => item.id !== incoming.id);
  return [incoming, ...filtered].sort((a, b) => a.codigoLpr.localeCompare(b.codigoLpr));
}

/**
 * Returns the Tailwind CSS background + text color classes for each classification level.
 * LIBERADO=green, VISITANTE=blue, ATENCAO=yellow, SUSPEITO=orange, CRITICO=red
 */
export function getClassificationTailwindClasses(classificacao: FeedItem['classificacao']): {
  bg: string;
  text: string;
  border: string;
} {
  switch (classificacao) {
    case 'LIBERADO':
      return { bg: 'bg-green-600', text: 'text-white', border: 'border-green-600' };
    case 'VISITANTE':
      return { bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-600' };
    case 'ATENCAO':
      return { bg: 'bg-yellow-500', text: 'text-white', border: 'border-yellow-500' };
    case 'SUSPEITO':
      return { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-500' };
    case 'CRITICO':
      return { bg: 'bg-red-700', text: 'text-white', border: 'border-red-700' };
  }
}

/**
 * Returns the hex color for inline border-left styling on event rows.
 * LIBERADO=green, VISITANTE=blue, ATENCAO=yellow, SUSPEITO=orange, CRITICO=red
 */
export function getClassificationColor(classificacao: FeedItem['classificacao']): string {
  switch (classificacao) {
    case 'LIBERADO':
      return '#16a34a';
    case 'VISITANTE':
      return '#2563eb';
    case 'ATENCAO':
      return '#eab308';
    case 'SUSPEITO':
      return '#f97316';
    case 'CRITICO':
      return '#b91c1c';
  }
}

export function getClassificationLabel(classificacao: FeedItem['classificacao']): string {
  switch (classificacao) {
    case 'LIBERADO':
      return 'Liberado';
    case 'VISITANTE':
      return 'Visitante';
    case 'ATENCAO':
      return 'Atenção';
    case 'SUSPEITO':
      return 'Suspeito';
    case 'CRITICO':
      return 'Crítico';
  }
}
