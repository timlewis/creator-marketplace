import type { ZodType } from 'zod';
import { badRequest } from './errors.js';

/**
 * Validate untrusted input, or fail with a 400 that names the offending field.
 *
 * Zod's own error shape is passed through as `details` so the frontend can put
 * a message next to the right input rather than showing a banner.
 */
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw badRequest(
      'Request validation failed',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  }

  return result.data;
}
