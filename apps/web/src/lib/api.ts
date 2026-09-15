import type {
  BidDto,
  BidPreview,
  BidWithContext,
  CampaignDetail,
  CampaignDto,
  CreatorDto,
  ErrorBody,
  MatchDto,
} from '@marketplace/api';

/**
 * A failure the UI can act on.
 *
 * `code` is the stable identifier the server promises; `message` is already
 * written for a creator to read, so components show it directly rather than
 * translating error codes into prose a second time.
 */
/**
 * Where the application server lives.
 *
 * Empty in the default setup, because nginx (in Docker) and the Vite dev proxy
 * both put the API on the same origin as the page - which keeps the browser
 * from ever making a cross-origin request. It is set only when the two are
 * genuinely split, as with a static host in front of a separately deployed API,
 * and then the server's CORS_ORIGIN has to name the frontend's origin.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    // Distinguish "we could not reach the server" from "the server said no",
    // because only the first one is worth offering a retry for.
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error.code ?? 'UNKNOWN',
      body?.error.message ?? `Request failed with status ${response.status}`,
      body?.error.details,
    );
  }

  return (await response.json()) as T;
}

const post = <T>(path: string, body: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  meta: () => request<{ devRoutesEnabled: boolean }>('/api/meta'),

  listCreators: () => request<{ creators: CreatorDto[] }>('/api/creators'),

  matches: (creatorId: string) =>
    request<{ matches: MatchDto[] }>(`/api/creators/${creatorId}/campaigns`),

  campaign: (campaignId: string, creatorId: string) =>
    request<CampaignDetail>(`/api/campaigns/${campaignId}?creatorId=${creatorId}`),

  previewBid: (campaignId: string, creatorId: string, amountCents: number) =>
    post<BidPreview>(`/api/campaigns/${campaignId}/bid-preview`, { creatorId, amountCents }),

  placeBid: (
    campaignId: string,
    input: { creatorId: string; amountCents: number; message?: string },
  ) => post<{ bid: BidDto }>(`/api/campaigns/${campaignId}/bids`, input),

  myBids: (creatorId: string) =>
    request<{ bids: BidWithContext[] }>(`/api/creators/${creatorId}/bids`),

  expireCampaign: (campaignId: string) =>
    post<{ campaign: CampaignDto }>(`/api/dev/campaigns/${campaignId}/expire`, {}),
};
