import Redis from 'ioredis';

export function createRedisClient(url: string): Redis {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      if (times > 10) return null; // Stop retrying
      return Math.min(times * 100, 3000);
    },
    lazyConnect: true,
  });

  redis.on('connect', () => console.log('[Redis] Connected'));
  redis.on('error', (err) => console.error('[Redis] Error:', err.message));

  // Connect async — don't block server startup
  redis.connect().catch((err) => {
    console.error('[Redis] Initial connection failed:', err.message);
  });

  return redis;
}
