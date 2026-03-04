import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';

let client: PrismaClient | null = null;

export function createPrismaClient(): PrismaClient {
  if (client) return client;

  client = new PrismaClient({
    log: config.isDev
      ? [
          { emit: 'stdout', level: 'query' },
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' },
        ]
      : [{ emit: 'stdout', level: 'error' }],
  });

  return client;
}
