import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { authenticateSocket, type RealtimeUser } from './auth';
import type { CrossSiteAlertDTO, RelatorioProntoDTO } from './dto';

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
  event: 'feed:evento-novo' | 'feed:placa-classificada' | 'feed:camera-status' | 'feed:alerta-cross-site' | 'report:pronto',
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
 * Emits a cross-site alert to all operators of the empresa.
 * INTEL-04: always room-scoped — never io.emit() global.
 * INTEL-03: payload includes plate, classification, detected obra, and original obra.
 */
export function emitAlertaCrossSite(empresaId: string, payload: CrossSiteAlertDTO): void {
  emitToEmpresa(getRealtimeServer(), empresaId, 'feed:alerta-cross-site', payload);
}

/**
 * Notifica a empresa quando um relatório assíncrono está pronto para download.
 * REPORTS-06: room-scoped — nunca io.emit() global.
 */
export function emitRelatorioPronto(empresaId: string, payload: RelatorioProntoDTO): void {
  emitToEmpresa(getRealtimeServer(), empresaId, 'report:pronto', payload);
}
