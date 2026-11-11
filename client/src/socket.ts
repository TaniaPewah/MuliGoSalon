import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@multigo/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Same origin: in dev Vite proxies /socket.io to the server, in prod the
// server serves the client itself.
export const socket: AppSocket = io({ autoConnect: false, transports: ['websocket', 'polling'] });
