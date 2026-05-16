import http from 'http';
import app from './app';
import { env } from './config/env';
import { pool } from './config/database';
import { setupWebSocket } from './websocket';

const httpServer = http.createServer(app);

// Attach Socket.IO
setupWebSocket(httpServer);

async function start() {
  // Verify DB connection
  try {
    await pool.query('SELECT 1');
    console.log('Database connection established.');
  } catch (err) {
    console.error('Cannot connect to database:', err);
    process.exit(1);
  }

  httpServer.listen(env.PORT, () => {
    console.log(`TenPOS API running on http://localhost:${env.PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`WebSocket: enabled`);
  });
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  httpServer.close(async () => {
    await pool.end();
    process.exit(0);
  });
});

start();
