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
    response = await fetch(path, {
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
