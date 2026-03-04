import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().default('postgresql://lumino:lumino@localhost:5432/lumino'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(8).default('dev-secret-change-in-production'),
  JWT_ALGORITHM: z.enum(['HS256', 'RS256', 'ES256']).default('HS256'),
  JWT_PUBLIC_KEY: z.string().optional(),
  CORS_ORIGINS: z.string().default('*'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
});

type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    for (const [key, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
      console.error(`  ${key}: ${(errors as string[]).join(', ')}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

const env = loadConfig();

export const config = {
  nodeEnv: env.NODE_ENV,
  isDev: env.NODE_ENV === 'development',
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  jwt: {
    secret: env.JWT_SECRET,
    algorithm: env.JWT_ALGORITHM as 'HS256' | 'RS256' | 'ES256',
    publicKey: env.JWT_PUBLIC_KEY,
  },
  corsOrigins: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(','),
  aiServiceUrl: env.AI_SERVICE_URL,
} as const;

export type Config = typeof config;
