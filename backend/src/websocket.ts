import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env';

interface AuthPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  branch_id: string | null;
}

export function setupWebSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Auth middleware — verify JWT on connect
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Missing auth token'));
      return;
    }
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthPayload;
    console.log(`WS connected: ${user.name} (${user.role})`);

    // Join branch room for targeted broadcasts
    if (user.branch_id) {
      socket.join(`branch:${user.branch_id}`);
    }
    // Admins join global room
    if (user.role === 'admin') {
      socket.join('global');
    }

    socket.on('disconnect', () => {
      console.log(`WS disconnected: ${user.name}`);
    });
  });

  return io;
}

// Broadcast helpers — called from route handlers
export function emitToAll(io: SocketIOServer, event: string, data: unknown): void {
  io.emit(event, data);
}

export function emitToBranch(io: SocketIOServer, branchId: string, event: string, data: unknown): void {
  io.to(`branch:${branchId}`).emit(event, data);
}

export function emitToAdmins(io: SocketIOServer, event: string, data: unknown): void {
  io.to('global').emit(event, data);
}

// Event names (for frontend to subscribe)
export const WS_EVENTS = {
  TRANSACTION_CREATED: 'transaction:created',
  TRANSACTION_VOIDED: 'transaction:voided',
  INVENTORY_UPDATED: 'inventory:updated',
  LOW_STOCK_ALERT: 'inventory:low_stock',
  STOCK_ADJUSTED: 'inventory:adjusted',
  USER_LOGIN: 'user:login',
  USER_LOGOUT: 'user:logout',
} as const;
