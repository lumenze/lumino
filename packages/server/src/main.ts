import Fastify from 'fastify';

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/env';
import { createPrismaClient } from './database/client';
import { createRedisClient } from './database/redis';
import { registerAuthModule } from './modules/auth';
import { registerWalkthroughModule } from './modules/walkthrough';
import { registerAnalyticsModule } from './modules/analytics';
import { registerUserStateModule } from './modules/user-state';
import { registerHealthModule } from './modules/health';
import { registerSdkServeModule } from './modules/sdk-serve';
import { registerSearchModule } from './modules/search';
import { registerTransitionsModule } from './modules/transitions';
import { errorHandler } from './common/middleware/error-handler';

async function main(): Promise<void> {
  // ── Create Fastify instance ───────────────────────────────────────

  const app = Fastify({
    logger: {
      level: config.logLevel,
      ...(config.isDev && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }),
    },
  });

  // ── Shared resources ──────────────────────────────────────────────

  const prisma = createPrismaClient();
  const redis = createRedisClient(config.redisUrl);

  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  // ── Plugins ───────────────────────────────────────────────────────

  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  // ── Error handling ────────────────────────────────────────────────

  app.setErrorHandler(errorHandler);

  // ── Modules ───────────────────────────────────────────────────────

  await registerAuthModule(app);
  await registerWalkthroughModule(app);
  await registerAnalyticsModule(app);
  await registerUserStateModule(app);
  await registerHealthModule(app);
  await registerSearchModule(app, prisma);
  await registerTransitionsModule(app);
  await registerSdkServeModule(app);

  // ── Health check ──────────────────────────────────────────────────

  app.get('/health', async () => ({
    status: 'ok',
    version: '0.1.0',
    uptime: process.uptime(),
  }));

  // ── Start ─────────────────────────────────────────────────────────

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`Lumino server listening on :${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // ── Graceful shutdown ─────────────────────────────────────────────

  const shutdown = async () => {
    app.log.info('Shutting down...');
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
