import express, { type Express } from 'express';
import type { IntelbrasPayload } from '@cargo-sentinel/shared';

export const app: Express = express();
app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

const PORT = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`api listening on ${PORT}`));
}
