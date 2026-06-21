import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import lprRouter from './routes/lpr';
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';

export const app: Express = express();
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

// Webhook da câmera — PÚBLICO (sem auth; câmera não tem token — Phase 1 não quebrada)
app.use('/api/lpr', lprRouter);

// Pipeline de proteção reutilizável (ordem: auth → tenant — Pitfall 5)
// Plan 04 usa: router.use(protectedPipeline) antes das rotas CRUD
export const protectedPipeline = [authMiddleware, tenantMiddleware];

// (rotas protegidas Obra/Camera montadas no Plan 04 usando protectedPipeline)

const PORT = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== 'test') {
  // Only start the BullMQ worker outside of tests to avoid opening Redis connections
  import('./jobs/worker');
  app.listen(PORT, () => console.log(`api listening on ${PORT}`));
}
