import type { PrismaClient, Walkthrough, WalkthroughVersion } from '@prisma/client';
import type { WalkthroughDefinition, WalkthroughStatus } from '@lumino/shared';

export class WalkthroughService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Queries ─────────────────────────────────────────────────────────

  async findById(id: string): Promise<Walkthrough | null> {
    return this.prisma.walkthrough.findUnique({ where: { id } });
  }

  async findByIdWithVersion(id: string): Promise<
    (Walkthrough & { versions: WalkthroughVersion[] }) | null
  > {
    return this.prisma.walkthrough.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });
  }

  async listByApp(
    appId: string,
    options: { status?: WalkthroughStatus; page?: number; limit?: number } = {},
  ) {
    const { status, page = 1, limit = 50 } = options;
    const where = {
      appId,
      ...(status && { status: status.toUpperCase() as any }),
    };

    const [items, total] = await Promise.all([
      this.prisma.walkthrough.findMany({
        where,
        include: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.walkthrough.count({ where }),
    ]);

    return { items, total, page, limit, hasMore: page * limit < total };
  }

  async listPublishedForUser(appId: string) {
    return this.prisma.walkthrough.findMany({
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
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listAppIds(): Promise<string[]> {
    const results = await this.prisma.walkthrough.findMany({
      select: { appId: true },
      distinct: ['appId'],
      orderBy: { appId: 'asc' },
    });
    return results.map((r) => r.appId);
  }

  // ── Commands ────────────────────────────────────────────────────────

  async create(params: {
    appId: string;
    definition: WalkthroughDefinition;
    createdBy: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const walkthrough = await tx.walkthrough.create({
        data: {
          appId: params.appId,
          status: 'DRAFT',
          currentVersion: 1,
          createdBy: params.createdBy,
        },
      });

      const version = await tx.walkthroughVersion.create({
        data: {
          walkthroughId: walkthrough.id,
          version: 1,
          definition: params.definition as any,
          createdBy: params.createdBy,
        },
      });

      return { ...walkthrough, versions: [version] };
    });
  }

  async update(params: {
    id: string;
    definition: WalkthroughDefinition;
    updatedBy: string;
    changelog?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.walkthrough.findUnique({ where: { id: params.id } });
      if (!current) throw new WalkthroughNotFoundError(params.id);

      const nextVersion = current.currentVersion + 1;

      const version = await tx.walkthroughVersion.create({
        data: {
          walkthroughId: params.id,
          version: nextVersion,
          definition: params.definition as any,
          createdBy: params.updatedBy,
          changelog: params.changelog,
        },
      });

      const walkthrough = await tx.walkthrough.update({
        where: { id: params.id },
        data: { currentVersion: nextVersion },
      });

      return { ...walkthrough, versions: [version] };
    });
  }

  async publish(id: string, publishedBy: string) {
    const walkthrough = await this.prisma.walkthrough.findUnique({ where: { id } });
    if (!walkthrough) throw new WalkthroughNotFoundError(id);

    return this.prisma.walkthrough.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedBy,
      },
    });
  }

  async archive(id: string) {
    return this.prisma.walkthrough.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  async getVersionHistory(walkthroughId: string) {
    return this.prisma.walkthroughVersion.findMany({
      where: { walkthroughId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        createdBy: true,
        createdAt: true,
        changelog: true,
      },
    });
  }

  async getVersion(walkthroughId: string, version: number) {
    return this.prisma.walkthroughVersion.findUnique({
      where: {
        walkthroughId_version: { walkthroughId, version },
      },
    });
  }

  async rollback(walkthroughId: string, targetVersion: number, rolledBackBy: string) {
    const target = await this.getVersion(walkthroughId, targetVersion);
    if (!target) throw new Error(`Version ${targetVersion} not found`);

    // Rollback = create new version with the old definition
    return this.update({
      id: walkthroughId,
      definition: target.definition as unknown as WalkthroughDefinition,
      updatedBy: rolledBackBy,
      changelog: `Rolled back to version ${targetVersion}`,
    });
  }

  async delete(id: string) {
    return this.prisma.walkthrough.delete({ where: { id } });
  }
}

export class WalkthroughNotFoundError extends Error {
  public readonly statusCode = 404;
  public readonly code = 'WT_NOT_FOUND';

  constructor(id: string) {
    super(`Walkthrough ${id} not found`);
    this.name = 'WalkthroughNotFoundError';
  }
}
