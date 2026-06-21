import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { authenticateSocket, type RealtimeUser } from './auth';

type SocketWithUser = Pick<Socket, 'data' | 'join'> & {
  data: {
    user: RealtimeUser;
  };
};

type IoLike = {
  to: (room: string) => {
    emit: (event: string, payload: unknown) => void;
  };
};

let ioInstance: Server | null = null;

export function buildEmpresaRoom(empresaId: string): string {
  return `empresa:${empresaId}`;
}

export function handleRealtimeConnection(socket: SocketWithUser): void {
  socket.join(buildEmpresaRoom(socket.data.user.empresaId));
}

export function emitToEmpresa(
  io: IoLike,
  empresaId: string,
  event: 'feed:evento-novo' | 'feed:placa-classificada' | 'feed:camera-status',
  payload: unknown,
): void {
  io.to(buildEmpresaRoom(empresaId)).emit(event, payload);
}

export function createRealtimeServer(server: HttpServer): Server {
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      await authenticateSocket(socket);
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error('Falha na autenticação do socket'));
    }
  });

  io.on('connection', (socket) => {
    handleRealtimeConnection(socket as SocketWithUser);
  });

  ioInstance = io;
  return io;
}

export function getRealtimeServer(): Server {
  if (!ioInstance) throw new Error('Realtime server not initialized');
  return ioInstance;
}

export function emitEventoNovo(empresaId: string, payload: unknown): void {
  emitToEmpresa(getRealtimeServer(), empresaId, 'feed:evento-novo', payload);
}

export function emitPlacaClassificada(empresaId: string, payload: unknown): void {
  emitToEmpresa(getRealtimeServer(), empresaId, 'feed:placa-classificada', payload);
}

export function emitCameraStatus(empresaId: string, payload: unknown): void {
  emitToEmpresa(getRealtimeServer(), empresaId, 'feed:camera-status', payload);
}

/**
 * Emite alerta cross-site para todos os operadores da empresa.
 * Stub ampliado em Plan 04-03 com o tipo CrossSiteAlertPayload completo.
 * INTEL-04: broadcast para sala empresa:{empresaId}
 */
export function emitAlertaCrossSite(empresaId: string, payload: unknown): void {
  emitToEmpresa(getRealtimeServer(), empresaId, 'feed:alerta-cross-site', payload);
}
