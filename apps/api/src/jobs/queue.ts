import { Queue } from 'bullmq';
import { createRedisConnection } from '../services/redis';

/**
 * BullMQ queue for LPR event processing.
 * Uses its own Redis connection (Pitfall 5: Queue and Worker need separate connections).
 */
export const lprQueue = new Queue('lpr-events', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

/**
 * BullMQ queue for alert processing (cross-site + WhatsApp).
 * Separate from lpr queue — concurrency 1 enforced in alert-worker (ALERTS-03).
 * Uses its own Redis connection (Pitfall 5).
 */
export const alertQueue = new Queue('alert-jobs', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

/**
 * BullMQ queue for async report generation (REPORTS-01).
 * Separate from lpr and alert queues — concurrency 2 in report-worker.
 * Uses its own Redis connection (Pitfall 5: Queue and Worker need separate connections).
 */
export const reportQueue = new Queue('report-jobs', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { age: 3600 }, // limpar jobs concluídos após 1h
    removeOnFail: { age: 86400 },    // manter jobs com falha por 24h para debug
  },
});
