import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { authHook, requireRole } from '../auth';
import { UserRole } from '@lumino/shared';

// ── Service ─────────────────────────────────────────────────────────────

class HealthService {
  constructor(private readonly prisma: PrismaClient) {}

  async getLatestHealth(walkthroughId: string) {
    return this.prisma.walkthroughHealthRecord.findFirst({
      where: { walkthroughId },
      orderBy: { checkedAt: 'desc' },
    });
  }

  async getHealthHistory(walkthroughId: string, limit = 20) {
    return this.prisma.walkthroughHealthRecord.findMany({
      where: { walkthroughId },
      orderBy: { checkedAt: 'desc' },
      take: limit,
    });
  }

  async getAppHealthOverview(appId: string) {
    // Get latest health record per walkthrough for this app
    const walkthroughs = await this.prisma.walkthrough.findMany({
      where: { appId, status: 'PUBLISHED' },
      include: {
        healthRecords: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
        },
      },
    });

    const summary = { healthy: 0, warning: 0, critical: 0, unchecked: 0 };
    for (const wt of walkthroughs) {
      const latest = wt.healthRecords[0];
      if (!latest) {
        summary.unchecked++;
      } else {
        summary[latest.status.toLowerCase() as keyof typeof summary]++;
      }
    }

    return {
      totalWalkthroughs: walkthroughs.length,
      summary,
      walkthroughs: walkthroughs.map((wt) => ({
        id: wt.id,
        currentVersion: wt.currentVersion,
        health: wt.healthRecords[0] ?? null,
      })),
    };
  }

  async recordHealth(params: {
    walkthroughId: string;
    walkthroughVersion: number;
    overallScore: number;
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    stepResults: unknown;
    autoHealsCount: number;
  }) {
    return this.prisma.walkthroughHealthRecord.create({
      data: {
        walkthroughId: params.walkthroughId,
        walkthroughVersion: params.walkthroughVersion,
        overallScore: params.overallScore,
        status: params.status,
        stepResults: params.stepResults as any,
        autoHealsCount: params.autoHealsCount,
      },
    });
  }
}

// ── Module Registration ─────────────────────────────────────────────────

export async function registerHealthModule(app: FastifyInstance): Promise<void> {
  const service = new HealthService((app as any).prisma);
  const prefix = '/api/v1/health';
  const adminPreHandler = [authHook, requireRole(UserRole.Author, UserRole.Admin)];

  // App health overview
  app.get<{ Params: { appId: string } }>(
    `${prefix}/apps/:appId`,
    { preHandler: adminPreHandler },
    async (request) => {
      const overview = await service.getAppHealthOverview(request.params.appId);
      return { success: true, data: overview };
    },
  );

  // Walkthrough health
  app.get<{ Params: { id: string } }>(
    `${prefix}/walkthroughs/:id`,
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const health = await service.getLatestHealth(request.params.id);
      if (!health) return reply.code(204).send();
      return { success: true, data: health };
    },
  );

  // Walkthrough health history
  app.get<{ Params: { id: string } }>(
    `${prefix}/walkthroughs/:id/history`,
    { preHandler: adminPreHandler },
    async (request) => {
      const items = await service.getHealthHistory(request.params.id);
      return { success: true, data: { items } };
    },
  );

  // Record health check result (called by AI service or CLI)
  app.post<{ Params: { id: string }; Body: any }>(
    `${prefix}/walkthroughs/:id/check`,
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const body = request.body as any;
      const record = await service.recordHealth({
        walkthroughId: request.params.id,
        walkthroughVersion: body.walkthroughVersion,
        overallScore: body.overallScore,
        status: body.status,
        stepResults: body.stepResults,
        autoHealsCount: body.autoHealsCount ?? 0,
      });
      return reply.code(201).send({ success: true, data: record });
    },
  );

  app.log.info('Health module registered');
}
