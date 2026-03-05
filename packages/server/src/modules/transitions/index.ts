import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type Redis from 'ioredis';
import { TransitionStatus, type CrossAppTransition } from '@lumino/shared';
import { DEFAULT_TRANSITION_TTL, TRANSITION_URL_PARAM } from '@lumino/shared';
import { authHook } from '../auth';
import { z } from 'zod';

const CreateTransitionBody = z.object({
  walkthroughId: z.string().min(1),
  walkthroughVersion: z.number().int().min(1),
  fromApp: z.string().min(1),
  toApp: z.string().min(1),
  currentStep: z.number().int().min(0),
  nextStep: z.number().int().min(0),
  ttlSeconds: z.number().int().min(30).max(3600).default(DEFAULT_TRANSITION_TTL),
  targetUrl: z.string().min(1),
  urlParamKey: z.string().min(1).default(TRANSITION_URL_PARAM),
});

const ConsumeTransitionBody = z.object({
  token: z.string().min(1),
});

const PendingTransitionQuery = z.object({
  appId: z.string().min(1).optional(),
  app_id: z.string().min(1).optional(),
});

type StoredTransition = {
  token: string;
  transition: CrossAppTransition;
  targetUrl: string;
  urlParamKey: string;
};

class TransitionService {
  constructor(private readonly redis: Redis) {}

  private transitionKey(token: string): string {
    return `transition:${token}`;
  }

  private pendingKey(userId: string, appId: string): string {
    return `transition:pending:${userId}:${appId}`;
  }

  async create(params: {
    userId: string;
    walkthroughId: string;
    walkthroughVersion: number;
    fromApp: string;
    toApp: string;
    currentStep: number;
    nextStep: number;
    ttlSeconds: number;
    targetUrl: string;
    urlParamKey: string;
  }): Promise<{ token: string; redirectUrl: string; transition: CrossAppTransition }> {
    const token = randomUUID().replace(/-/g, '');
    const transition: CrossAppTransition = {
      id: randomUUID().replace(/-/g, ''),
      userId: params.userId,
      walkthroughId: params.walkthroughId,
      walkthroughVersion: params.walkthroughVersion,
      fromApp: params.fromApp,
      toApp: params.toApp,
      currentStep: params.currentStep,
      nextStep: params.nextStep,
      timestamp: new Date().toISOString(),
      ttlSeconds: params.ttlSeconds,
      status: TransitionStatus.Pending,
    };

    const payload: StoredTransition = {
      token,
      transition,
      targetUrl: params.targetUrl,
      urlParamKey: params.urlParamKey,
    };

    await this.redis.set(this.transitionKey(token), JSON.stringify(payload), 'EX', params.ttlSeconds);
    await this.redis.set(this.pendingKey(params.userId, params.toApp), token, 'EX', params.ttlSeconds);

    const url = new URL(params.targetUrl, params.targetUrl.startsWith('http') ? undefined : 'http://localhost');
    url.searchParams.set(params.urlParamKey, token);
    const redirectUrl = params.targetUrl.startsWith('http')
      ? url.toString()
      : `${url.pathname}${url.search}${url.hash}`;

    return { token, redirectUrl, transition };
  }

  async getPending(userId: string, appId: string): Promise<StoredTransition | null> {
    const token = await this.redis.get(this.pendingKey(userId, appId));
    if (!token) return null;
    const raw = await this.redis.get(this.transitionKey(token));
    if (!raw) return null;
    return JSON.parse(raw) as StoredTransition;
  }

  async consume(userId: string, token: string, appId: string): Promise<CrossAppTransition | null> {
    const raw = await this.redis.get(this.transitionKey(token));
    if (!raw) return null;
    const payload = JSON.parse(raw) as StoredTransition;

    if (payload.transition.userId !== userId) {
      throw new Error('TRANS_USER_MISMATCH');
    }
    if (payload.transition.toApp !== appId) {
      throw new Error('TRANS_APP_MISMATCH');
    }

    await this.redis.del(this.transitionKey(token));
    await this.redis.del(this.pendingKey(userId, appId));

    return {
      ...payload.transition,
      status: TransitionStatus.Completed,
    };
  }
}

export async function registerTransitionsModule(app: FastifyInstance): Promise<void> {
  const service = new TransitionService((app as any).redis);
  const prefix = '/api/v1/transitions';

  app.post<{ Body: unknown }>(
    prefix,
    { preHandler: [authHook] },
    async (request, reply) => {
      const parsed = CreateTransitionBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid transition payload', details: parsed.error.flatten() },
        });
      }

      const result = await service.create({
        userId: request.user.sub,
        ...parsed.data,
      });

      return reply.code(201).send({ success: true, data: result });
    },
  );

  app.get<{ Querystring: { appId?: string; app_id?: string } }>(
    `${prefix}/pending`,
    { preHandler: [authHook] },
    async (request, reply) => {
      const parsed = PendingTransitionQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(422).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query params', details: parsed.error.flatten() },
        });
      }

      const appId = parsed.data.appId ?? parsed.data.app_id;
      if (!appId) {
        return reply.code(422).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'appId is required' },
        });
      }

      const pending = await service.getPending(request.user.sub, appId);
      if (!pending) {
        return reply.code(204).send();
      }
      return { success: true, data: pending.transition };
    },
  );

  app.post<{ Body: unknown }>(
    `${prefix}/consume`,
    { preHandler: [authHook] },
    async (request, reply) => {
      const parsed = ConsumeTransitionBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid consume payload', details: parsed.error.flatten() },
        });
      }

      const appId = (request.headers['x-lumino-app'] as string | undefined) ?? '';
      if (!appId) {
        return reply.code(422).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'X-Lumino-App header required' },
        });
      }

      try {
        const consumed = await service.consume(request.user.sub, parsed.data.token, appId);
        if (!consumed) {
          return reply.code(404).send({
            success: false,
            error: { code: 'TRANS_NOT_FOUND', message: 'Transition not found or expired' },
          });
        }
        return { success: true, data: consumed };
      } catch (error) {
        const code = error instanceof Error ? error.message : 'TRANS_ERROR';
        const status = code === 'TRANS_USER_MISMATCH' ? 403 : 422;
        return reply.code(status).send({
          success: false,
          error: { code, message: 'Invalid transition for current user/app' },
        });
      }
    },
  );

  app.log.info('Transitions module registered');
}
