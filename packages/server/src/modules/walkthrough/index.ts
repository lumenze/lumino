import type { FastifyInstance } from 'fastify';
import { WalkthroughService } from './service';
import { registerWalkthroughRoutes } from './routes';

export async function registerWalkthroughModule(app: FastifyInstance): Promise<void> {
  const service = new WalkthroughService((app as any).prisma);
  registerWalkthroughRoutes(app, service);
  app.log.info('Walkthrough module registered');
}

export { WalkthroughService } from './service';
