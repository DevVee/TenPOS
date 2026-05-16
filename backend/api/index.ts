// Vercel serverless entry point — exports Express app as a handler.
// Socket.IO real-time features are not available in serverless deployments;
// clients fall back to polling / offline sync via IndexedDB.
import app from '../src/app'

export default app
