import express, { type Express } from 'express';
import type { IntelbrasPayload } from '@cargo-sentinel/shared';
import lprRouter from './routes/lpr';

export const app: Express = express();
app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

// Mount LPR webhook router (LPR-01)
app.use('/api/lpr', lprRouter);

const PORT = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== 'test') {
  // Only start the BullMQ worker outside of tests to avoid opening Redis connections
  import('./jobs/worker');
  app.listen(PORT, () => console.log(`api listening on ${PORT}`));
}
