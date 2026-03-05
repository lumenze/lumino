import type { FastifyInstance } from 'fastify';
import type { PrismaClient, Walkthrough, WalkthroughVersion } from '@prisma/client';
import { z } from 'zod';
import { authHook } from '../auth';

const NlSearchBody = z.object({
  query: z.string().min(1),
  appId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(10).default(5),
});

type ScoredResult = {
  walkthroughId: string;
  title: string;
  description: string;
  confidence: number;
  reason: string;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function scoreWalkthrough(query: string, definition: any): { score: number; reason: string } {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return { score: 0, reason: 'No query terms' };

  const title = String(definition?.title ?? '');
  const description = String(definition?.description ?? '');
  const steps = Array.isArray(definition?.steps) ? definition.steps : [];

  const titleTerms = tokenize(title);
  const descriptionTerms = tokenize(description);
  const stepTerms = tokenize(
    steps
      .map((s: any) => `${s?.title ?? ''} ${s?.description ?? ''}`)
      .join(' '),
  );

  let score = 0;
  let titleHits = 0;
  let descriptionHits = 0;
  let stepHits = 0;

  for (const term of queryTerms) {
    if (titleTerms.includes(term)) {
      score += 6;
      titleHits++;
    }
    if (descriptionTerms.includes(term)) {
      score += 3;
      descriptionHits++;
    }
    if (stepTerms.includes(term)) {
      score += 2;
      stepHits++;
    }
  }

  if (title.toLowerCase().includes(query.toLowerCase())) {
    score += 8;
  }

  const maxScore = queryTerms.length * 11 + 8;
  const confidence = Math.min(1, score / Math.max(maxScore, 1));

  let reason = 'Low semantic overlap';
  if (titleHits > 0) reason = `Matched title terms (${titleHits})`;
  else if (descriptionHits > 0) reason = `Matched description terms (${descriptionHits})`;
  else if (stepHits > 0) reason = `Matched step terms (${stepHits})`;

  return { score: confidence, reason };
}

type WalkthroughWithLatestVersion = Walkthrough & { versions: WalkthroughVersion[] };

export async function registerSearchModule(
  app: FastifyInstance,
  prisma: PrismaClient,
): Promise<void> {
  app.post<{ Body: unknown }>(
    '/api/v1/search/nl',
    { preHandler: [authHook] },
    async (request, reply) => {
      const parsed = NlSearchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid search request',
            details: parsed.error.flatten(),
          },
        });
      }

      const appId = parsed.data.appId ?? (request.headers['x-lumino-app'] as string | undefined);
      if (!appId) {
        return reply.code(422).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'appId is required' },
        });
      }

      const walkthroughs: WalkthroughWithLatestVersion[] = await prisma.walkthrough.findMany({
        where: {
          appId,
          status: 'PUBLISHED',
        },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      });

      const scored: ScoredResult[] = walkthroughs
        .map((wt: WalkthroughWithLatestVersion) => {
          const latest = wt.versions[0];
          if (!latest) return null;

          const definition = latest.definition as any;
          const { score, reason } = scoreWalkthrough(parsed.data.query, definition);
          if (score <= 0.05) return null;

          return {
            walkthroughId: wt.id,
            title: String(definition?.title ?? 'Untitled Walkthrough'),
            description: String(definition?.description ?? ''),
            confidence: Number(score.toFixed(3)),
            reason,
          };
        })
        .filter((r: ScoredResult | null): r is ScoredResult => r !== null)
        .sort((a: ScoredResult, b: ScoredResult) => b.confidence - a.confidence)
        .slice(0, parsed.data.limit);

      return {
        success: true,
        data: {
          items: scored,
          query: parsed.data.query,
          total: scored.length,
        },
      };
    },
  );

  app.log.info('Search module registered');
}
