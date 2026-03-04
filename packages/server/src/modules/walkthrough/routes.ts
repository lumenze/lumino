import type { FastifyInstance } from 'fastify';
import { UserRole, WalkthroughStatus } from '@lumino/shared';
import { WalkthroughDefinitionSchema } from '@lumino/shared';
import { authHook, requireRole } from '../auth';
import { WalkthroughService, WalkthroughNotFoundError } from './service';
import { z } from 'zod';

// ── Request schemas ─────────────────────────────────────────────────────

const CreateBody = z.object({
  appId: z.string().min(1),
  definition: WalkthroughDefinitionSchema,
});

const UpdateBody = z.object({
  definition: WalkthroughDefinitionSchema,
  changelog: z.string().optional(),
});

const ListQuery = z.object({
  status: z.nativeEnum(WalkthroughStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const RollbackBody = z.object({
  targetVersion: z.number().int().min(1),
});

// ── Route Registration ──────────────────────────────────────────────────

export function registerWalkthroughRoutes(app: FastifyInstance, service: WalkthroughService): void {
  const prefix = '/api/v1/walkthroughs';

  // All routes require auth
  const authPreHandler = [authHook];
  const authorPreHandler = [authHook, requireRole(UserRole.Author, UserRole.Admin)];
  const adminPreHandler = [authHook, requireRole(UserRole.Admin)];

  // ── List walkthroughs for an app ────────────────────────────────────

  app.get<{ Querystring: { appId: string; status?: string; page?: string; limit?: string } }>(
    `${prefix}`,
    { preHandler: authPreHandler },
    async (request) => {
      const appId = request.query.appId ?? request.headers['x-lumino-app'] as string;
      if (!appId) {
        return { success: false, error: { code: 'VALIDATION_ERROR', message: 'appId is required' } };
      }

      const query = ListQuery.parse(request.query);
      const result = await service.listByApp(appId, query);
      return { success: true, data: result };
    },
  );

  // ── List published walkthroughs (for SDK/customers) ─────────────────

  app.get<{ Querystring: { appId: string } }>(
    `${prefix}/published`,
    { preHandler: authPreHandler },
    async (request) => {
      const appId = request.query.appId ?? request.headers['x-lumino-app'] as string;
      if (!appId) {
        return { success: false, error: { code: 'VALIDATION_ERROR', message: 'appId is required' } };
      }

      const items = await service.listPublishedForUser(appId);
      return { success: true, data: { items } };
    },
  );

  // ── Get single walkthrough ──────────────────────────────────────────

  app.get<{ Params: { id: string } }>(
    `${prefix}/:id`,
    { preHandler: authPreHandler },
    async (request, reply) => {
      const wt = await service.findByIdWithVersion(request.params.id);
      if (!wt) {
        return reply.code(404).send({
          success: false,
          error: { code: 'WT_NOT_FOUND', message: 'Walkthrough not found' },
        });
      }
      return { success: true, data: wt };
    },
  );

  // ── Create walkthrough ──────────────────────────────────────────────

  app.post<{ Body: unknown }>(
    `${prefix}`,
    { preHandler: authorPreHandler },
    async (request, reply) => {
      const parsed = CreateBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parsed.error.flatten(),
          },
        });
      }

      const result = await service.create({
        appId: parsed.data.appId,
        definition: parsed.data.definition,
        createdBy: request.user.sub,
      });

      return reply.code(201).send({ success: true, data: result });
    },
  );

  // ── Update walkthrough (creates new version) ────────────────────────

  app.put<{ Params: { id: string }; Body: unknown }>(
    `${prefix}/:id`,
    { preHandler: authorPreHandler },
    async (request, reply) => {
      const parsed = UpdateBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parsed.error.flatten(),
          },
        });
      }

      try {
        const result = await service.update({
          id: request.params.id,
          definition: parsed.data.definition,
          updatedBy: request.user.sub,
          changelog: parsed.data.changelog,
        });
        return { success: true, data: result };
      } catch (err) {
        if (err instanceof WalkthroughNotFoundError) {
          return reply.code(404).send({ success: false, error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );

  // ── Publish walkthrough ─────────────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    `${prefix}/:id/publish`,
    { preHandler: authorPreHandler },
    async (request, reply) => {
      try {
        const result = await service.publish(request.params.id, request.user.sub);
        return { success: true, data: result };
      } catch (err) {
        if (err instanceof WalkthroughNotFoundError) {
          return reply.code(404).send({ success: false, error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );

  // ── Archive walkthrough ─────────────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    `${prefix}/:id/archive`,
    { preHandler: adminPreHandler },
    async (request) => {
      const result = await service.archive(request.params.id);
      return { success: true, data: result };
    },
  );

  // ── Version history ─────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>(
    `${prefix}/:id/versions`,
    { preHandler: authPreHandler },
    async (request) => {
      const versions = await service.getVersionHistory(request.params.id);
      return { success: true, data: { items: versions } };
    },
  );

  // ── Get specific version ────────────────────────────────────────────

  app.get<{ Params: { id: string; version: string } }>(
    `${prefix}/:id/versions/:version`,
    { preHandler: authPreHandler },
    async (request, reply) => {
      const version = await service.getVersion(request.params.id, parseInt(request.params.version, 10));
      if (!version) {
        return reply.code(404).send({
          success: false,
          error: { code: 'WT_VERSION_NOT_FOUND', message: 'Version not found' },
        });
      }
      return { success: true, data: version };
    },
  );

  // ── Rollback to version ─────────────────────────────────────────────

  app.post<{ Params: { id: string }; Body: unknown }>(
    `${prefix}/:id/rollback`,
    { preHandler: authorPreHandler },
    async (request, reply) => {
      const parsed = RollbackBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'targetVersion is required' },
        });
      }

      try {
        const result = await service.rollback(
          request.params.id,
          parsed.data.targetVersion,
          request.user.sub,
        );
        return { success: true, data: result };
      } catch (err) {
        if (err instanceof WalkthroughNotFoundError) {
          return reply.code(404).send({ success: false, error: { code: 'WT_NOT_FOUND', message: err.message } });
        }
        throw err;
      }
    },
  );

  // ── Delete walkthrough ──────────────────────────────────────────────

  app.delete<{ Params: { id: string } }>(
    `${prefix}/:id`,
    { preHandler: adminPreHandler },
    async (request, reply) => {
      await service.delete(request.params.id);
      return reply.code(204).send();
    },
  );
}
