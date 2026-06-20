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
