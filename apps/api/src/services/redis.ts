import IORedis from 'ioredis';

/**
 * Factory that creates an independent IORedis connection.
 * BullMQ Queue and Worker each require their own connection (Pitfall 5).
 * maxRetriesPerRequest: null is required by BullMQ.
 */
export function createRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}
