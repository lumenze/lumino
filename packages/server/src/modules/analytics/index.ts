import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { AnalyticsEventSchema } from '@lumino/shared';
import { authHook } from '../auth';
import { z } from 'zod';

// ── Service ─────────────────────────────────────────────────────────────

class AnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  async ingest(event: z.infer<typeof AnalyticsEventSchema>) {
    return this.prisma.analyticsEvent.create({
      data: {
        type: event.type,
        userId: event.userId,
        walkthroughId: event.walkthroughId,
        walkthroughVersion: event.walkthroughVersion,
        stepId: event.stepId,
        sessionId: event.sessionId,
        pageUrl: event.pageUrl,
        timestamp: new Date(event.timestamp),
        metadata: event.metadata as any,
      },
    });
  }

  async ingestBatch(events: z.infer<typeof AnalyticsEventSchema>[]) {
    return this.prisma.analyticsEvent.createMany({
      data: events.map((e) => ({
        type: e.type,
        userId: e.userId,
        walkthroughId: e.walkthroughId,
        walkthroughVersion: e.walkthroughVersion,
        stepId: e.stepId,
        sessionId: e.sessionId,
        pageUrl: e.pageUrl,
        timestamp: new Date(e.timestamp),
        metadata: e.metadata as any,
      })),
    });
  }

  async getSummary(walkthroughId: string, period: 'hourly' | 'daily' = 'daily', days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.analyticsSummary.findMany({
      where: {
        walkthroughId,
        period,
        periodStart: { gte: since },
      },
      orderBy: { periodStart: 'desc' },
    });
  }

  async getWalkthroughStats(walkthroughId: string) {
    const [impressions, starts, completions, abandonments] = await Promise.all([
      this.prisma.analyticsEvent.count({ where: { walkthroughId, type: 'walkthrough_impression' } }),
      this.prisma.analyticsEvent.count({ where: { walkthroughId, type: 'walkthrough_started' } }),
      this.prisma.analyticsEvent.count({ where: { walkthroughId, type: 'walkthrough_completed' } }),
      this.prisma.analyticsEvent.count({ where: { walkthroughId, type: 'walkthrough_abandoned' } }),
    ]);

    return {
      impressions,
      starts,
      completions,
      abandonments,
      completionRate: starts > 0 ? Math.round((completions / starts) * 100) : 0,
    };
  }
}

// ── Request schemas ─────────────────────────────────────────────────────

const BatchBody = z.object({
  events: z.array(AnalyticsEventSchema).min(1).max(100),
});

// ── Module Registration ─────────────────────────────────────────────────

export async function registerAnalyticsModule(app: FastifyInstance): Promise<void> {
  const service = new AnalyticsService((app as any).prisma);
  const prefix = '/api/v1/analytics';

  // Ingest single event
  app.post<{ Body: unknown }>(
    `${prefix}/events`,
    { preHandler: [authHook] },
    async (request, reply) => {
      const parsed = AnalyticsEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid event', details: parsed.error.flatten() },
        });
      }
      await service.ingest(parsed.data);
      return reply.code(201).send({ success: true });
    },
  );

  // Ingest batch
  app.post<{ Body: unknown }>(
    `${prefix}/events/batch`,
    { preHandler: [authHook] },
    async (request, reply) => {
      const parsed = BatchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid batch', details: parsed.error.flatten() },
        });
      }
      const result = await service.ingestBatch(parsed.data.events);
      return reply.code(201).send({ success: true, data: { count: result.count } });
    },
  );

  // Get walkthrough stats
  app.get<{ Params: { id: string } }>(
    `${prefix}/walkthroughs/:id/stats`,
    { preHandler: [authHook] },
    async (request) => {
      const stats = await service.getWalkthroughStats(request.params.id);
      return { success: true, data: stats };
    },
  );

  // Get time-series summaries
  app.get<{ Params: { id: string }; Querystring: { period?: string; days?: string } }>(
    `${prefix}/walkthroughs/:id/summary`,
    { preHandler: [authHook] },
    async (request) => {
      const period = (request.query.period === 'hourly' ? 'hourly' : 'daily') as 'hourly' | 'daily';
      const days = parseInt(request.query.days ?? '30', 10);
      const data = await service.getSummary(request.params.id, period, days);
      return { success: true, data: { items: data } };
    },
  );

  app.log.info('Analytics module registered');
}
