import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import lprRouter from './routes/lpr';
import obrasRouter from './routes/obras';
import camerasRouter from './routes/cameras';
import { protectedPipeline } from './middleware/pipeline';

export const app: Express = express();
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

// Webhook da câmera — PÚBLICO (sem auth; câmera não tem token — Phase 1 não quebrada)
app.use('/api/lpr', lprRouter);

// Rotas protegidas de Obras e Câmeras (TENANT-05, TENANT-06)
// protectedPipeline = [authMiddleware, tenantMiddleware] — importado de middleware/pipeline (sem ciclo)
app.use('/api/obras', ...protectedPipeline, obrasRouter);
// camerasRouter usa mergeParams: true para herdar :obraId do parent
app.use('/api/obras/:obraId/cameras', ...protectedPipeline, camerasRouter);

const PORT = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== 'test') {
  // Only start the BullMQ worker outside of tests to avoid opening Redis connections
  import('./jobs/worker');
  app.listen(PORT, () => console.log(`api listening on ${PORT}`));
}
