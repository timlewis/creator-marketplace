/**
 * Minimal env access for the standalone migrate and seed entry points.
 *
 * The API and worker parse their full configuration with zod at boot; these
 * scripts need one variable and should not drag that schema in, because their
 * requirements are genuinely narrower.
 */
export function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and set it.');
  }
  return url;
}
