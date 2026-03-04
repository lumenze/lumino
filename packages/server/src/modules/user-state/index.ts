import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { authHook } from '../auth';
import { z } from 'zod';

// ── Service ─────────────────────────────────────────────────────────────

class UserStateService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async getProgress(userId: string, walkthroughId: string) {
    // Check Redis first (hot path)
    const cached = await this.redis.get(`progress:${userId}:${walkthroughId}`);
    if (cached) return JSON.parse(cached);

    // Fall back to DB
    const progress = await this.prisma.userProgress.findUnique({
      where: { userId_walkthroughId: { userId, walkthroughId } },
    });

    // Cache for 5 minutes
    if (progress) {
      await this.redis.set(
        `progress:${userId}:${walkthroughId}`,
        JSON.stringify(progress),
        'EX',
        300,
      );
    }

    return progress;
  }

  async getAllProgress(userId: string) {
    return this.prisma.userProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async upsertProgress(params: {
    userId: string;
    walkthroughId: string;
    walkthroughVersion: number;
    currentStepId: string;
    currentStepOrder: number;
    completed: boolean;
  }) {
    const data = {
      walkthroughVersion: params.walkthroughVersion,
      currentStepId: params.currentStepId,
      currentStepOrder: params.currentStepOrder,
      completed: params.completed,
      ...(params.completed && { completedAt: new Date() }),
    };

    const progress = await this.prisma.userProgress.upsert({
      where: {
        userId_walkthroughId: {
          userId: params.userId,
          walkthroughId: params.walkthroughId,
        },
      },
      create: {
        userId: params.userId,
        walkthroughId: params.walkthroughId,
        ...data,
      },
      update: data,
    });

    // Update cache
    await this.redis.set(
      `progress:${params.userId}:${params.walkthroughId}`,
      JSON.stringify(progress),
      'EX',
      300,
    );

    return progress;
  }

  async resetProgress(userId: string, walkthroughId: string) {
    await this.redis.del(`progress:${userId}:${walkthroughId}`);
    return this.prisma.userProgress.delete({
      where: { userId_walkthroughId: { userId, walkthroughId } },
    }).catch(() => null); // Ignore if not found
  }
}

// ── Request schemas ─────────────────────────────────────────────────────

const UpsertProgressBody = z.object({
  walkthroughId: z.string().min(1),
  walkthroughVersion: z.number().int().min(1),
  currentStepId: z.string().min(1),
  currentStepOrder: z.number().int().min(0),
  completed: z.boolean().default(false),
});

// ── Module Registration ─────────────────────────────────────────────────

export async function registerUserStateModule(app: FastifyInstance): Promise<void> {
  const service = new UserStateService((app as any).prisma, (app as any).redis);
  const prefix = '/api/v1/user-state';

  // Get progress for a specific walkthrough
  app.get<{ Params: { walkthroughId: string } }>(
    `${prefix}/progress/:walkthroughId`,
    { preHandler: [authHook] },
    async (request, reply) => {
      const progress = await service.getProgress(request.user.sub, request.params.walkthroughId);
      if (!progress) {
        return reply.code(204).send();
      }
      return { success: true, data: progress };
    },
  );

  // Get all progress for current user
  app.get(
    `${prefix}/progress`,
    { preHandler: [authHook] },
    async (request) => {
      const items = await service.getAllProgress(request.user.sub);
      return { success: true, data: { items } };
    },
  );

  // Update progress
  app.put<{ Body: unknown }>(
    `${prefix}/progress`,
    { preHandler: [authHook] },
    async (request, reply) => {
      const parsed = UpsertProgressBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.flatten() },
        });
      }

      const progress = await service.upsertProgress({
        userId: request.user.sub,
        ...parsed.data,
      });

      return { success: true, data: progress };
    },
  );

  // Reset progress
  app.delete<{ Params: { walkthroughId: string } }>(
    `${prefix}/progress/:walkthroughId`,
    { preHandler: [authHook] },
    async (request, reply) => {
      await service.resetProgress(request.user.sub, request.params.walkthroughId);
      return reply.code(204).send();
    },
  );

  app.log.info('UserState module registered');
}
