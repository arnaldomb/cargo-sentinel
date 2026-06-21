import { createServer } from 'http';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import lprRouter from './routes/lpr';
import obrasRouter from './routes/obras';
import camerasRouter from './routes/cameras';
import placasRouter from './routes/placas';
import eventosRouter from './routes/eventos';
import cameraStatusRouter from './routes/camera-status';
import configuracoesAlertaRouter from './routes/configuracoes-alerta';
import relatoriosRouter from './routes/relatorios';
import adminRouter from './routes/admin';
import { protectedPipeline } from './middleware/pipeline';
import { requireRole } from './middleware/rbac';
import { createRealtimeServer } from './realtime/server';

// Fail-fast: validar variáveis críticas antes de iniciar (SADMIN-05)
const REQUIRED_ENV_VARS = [
  'AUTH_SECRET',
  'DATABASE_URL',
  'GARAGE_ACCESS_KEY',
  'GARAGE_SECRET_KEY',
  'GARAGE_SERVER_URL',
  'REDIS_URL',
] as const;

if (process.env.NODE_ENV !== 'test') {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[FATAL] Variáveis de ambiente obrigatórias não configuradas: ${missing.join(', ')}`);
    console.error('O servidor não iniciará sem essas variáveis. Configure o arquivo .env.');
    process.exit(1);
  }
}

export const app: Express = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(helmet());
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

// Webhook da câmera — PÚBLICO (sem auth; câmera não tem token — Phase 1 não quebrada)
app.use('/api/lpr', lprRouter);
app.use('/', lprRouter);

// Rotas protegidas de Obras e Câmeras (TENANT-05, TENANT-06)
// protectedPipeline = [authMiddleware, tenantMiddleware] — importado de middleware/pipeline (sem ciclo)
app.use('/api/obras', ...protectedPipeline, obrasRouter);
// camerasRouter usa mergeParams: true para herdar :obraId do parent
app.use('/api/obras/:obraId/cameras', ...protectedPipeline, camerasRouter);
app.use('/api/placas', ...protectedPipeline, placasRouter);
app.use('/api/eventos', ...protectedPipeline, eventosRouter);
app.use('/api/cameras', ...protectedPipeline, cameraStatusRouter);
app.use('/api/configuracoes-alerta', ...protectedPipeline, configuracoesAlertaRouter);
app.use('/api/relatorios', ...protectedPipeline, relatoriosRouter);

// Rotas Super Admin — SADMIN-01..04
// requireRole('SUPER_ADMIN') aplicado ao router inteiro como middleware adicional
app.use('/api/admin', ...protectedPipeline, requireRole('SUPER_ADMIN'), adminRouter);

export const httpServer = createServer(app);
export const io = createRealtimeServer(httpServer);

const PORT = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== 'test') {
  // Only start the BullMQ workers outside of tests to avoid opening Redis connections
  import('./jobs/worker');
  import('./jobs/alert-worker');   // ALERTS-03: alert worker registers with concurrency 1
  import('./jobs/report-worker'); // REPORTS-01: report worker stub, concurrency 2
  httpServer.listen(PORT, () => console.log(`api listening on ${PORT}`));
}
