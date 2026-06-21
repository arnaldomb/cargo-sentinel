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
