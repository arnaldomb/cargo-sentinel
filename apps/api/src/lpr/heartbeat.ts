const CAMERA_KEEPALIVE_WINDOW_MS = 60 * 1000;

const lastHeartbeatByCodigoLpr = new Map<string, Date>();

function normalizeCameraIdentifier(cameraIdentifier: string): string {
  return cameraIdentifier.trim();
}

export function recordCameraHeartbeat(cameraIdentifier: string, receivedAt = new Date()): void {
  const normalized = normalizeCameraIdentifier(cameraIdentifier);
  if (!normalized) return;
  lastHeartbeatByCodigoLpr.set(normalized, receivedAt);
}

export function getLastCameraHeartbeat(cameraIdentifier: string): Date | null {
  const normalized = normalizeCameraIdentifier(cameraIdentifier);
  if (!normalized) return null;
  return lastHeartbeatByCodigoLpr.get(normalized) ?? null;
}

export function isCameraOnline(cameraIdentifier: string, now = Date.now()): boolean {
  const lastHeartbeat = getLastCameraHeartbeat(cameraIdentifier);
  if (!lastHeartbeat) return false;
  return now - lastHeartbeat.getTime() <= CAMERA_KEEPALIVE_WINDOW_MS;
}

export function resetCameraHeartbeatRegistry(): void {
  lastHeartbeatByCodigoLpr.clear();
}

export { CAMERA_KEEPALIVE_WINDOW_MS };
