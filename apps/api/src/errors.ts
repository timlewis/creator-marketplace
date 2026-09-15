/**
 * A failure the caller can do something about.
 *
 * Every error the API returns on purpose carries a stable machine-readable
 * `code` alongside the human message, so the frontend can branch on the reason
 * (offer to edit a bid, explain an eligibility gap) instead of pattern-matching
 * on prose that might be reworded later.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string): AppError =>
  new AppError(404, 'NOT_FOUND', `${what} not found`);

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError(400, 'BAD_REQUEST', message, details);

/** The creator is not allowed to bid on this campaign at all. */
export const ineligible = (message: string, code = 'INELIGIBLE'): AppError =>
  new AppError(422, code, message);

/** The campaign is no longer accepting bids. Distinct from ineligibility: this one is about time. */
export const biddingClosed = (message: string): AppError =>
  new AppError(409, 'BIDDING_CLOSED', message);

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function toErrorBody(error: AppError): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}
