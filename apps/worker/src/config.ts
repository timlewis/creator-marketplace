import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** How often the loop wakes up when running as a long-lived process. */
  CLOSE_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  /** Serves health and metrics so Kubernetes can tell a wedged worker from an idle one. */
  HEALTH_PORT: z.coerce.number().int().positive().default(3001),
  /** How long a campaign may sit past its deadline before it counts as overdue. */
  OVERDUE_GRACE_MS: z.coerce.number().int().nonnegative().default(120_000),
  /** Caps campaigns closed per run. */
  CLOSE_BATCH_SIZE: z.coerce.number().int().positive().default(100),
});

export type WorkerConfig = z.infer<typeof EnvSchema>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = EnvSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid worker configuration:\n${issues}`);
  }

  return parsed.data;
}
