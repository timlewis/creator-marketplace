import { z } from 'zod';

/** "true" enables; anything else (including absent) disables. */
const booleanFlag = z
  .string()
  .default('false')
  .transform((value) => value.toLowerCase() === 'true');

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Comma-separated list, or "*" to allow any origin. */
  CORS_ORIGIN: z.string().default('*'),
  /**
   * Gates the /api/dev routes that let a reviewer pull a deadline forward.
   * Off unless explicitly switched on, so a production deploy cannot expose
   * them by forgetting to set something.
   */
  ENABLE_DEV_ROUTES: booleanFlag,
});

export type Config = z.infer<typeof EnvSchema> & { corsOrigin: string[] | true };

/**
 * Parse configuration once, at boot, and crash loudly if it is wrong.
 *
 * A service that starts with a bad DATABASE_URL and only fails on the first
 * request is far harder to diagnose than one that refuses to start at all.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const corsOrigin =
    parsed.data.CORS_ORIGIN.trim() === '*'
      ? true
      : parsed.data.CORS_ORIGIN.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean);

  return { ...parsed.data, corsOrigin };
}
