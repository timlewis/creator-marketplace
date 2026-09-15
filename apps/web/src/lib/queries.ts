import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export const queryKeys = {
  meta: ['meta'] as const,
  creators: ['creators'] as const,
  matches: (creatorId: string) => ['matches', creatorId] as const,
  campaign: (campaignId: string, creatorId: string) => ['campaign', campaignId, creatorId] as const,
  bids: (creatorId: string) => ['bids', creatorId] as const,
};

/**
 * How often the UI re-reads state that a background job can change underneath it.
 *
 * Polling rather than websockets: the only thing that moves without user action
 * is a campaign closing, which happens on the order of minutes. A socket would
 * be more machinery than the problem needs, and this degrades gracefully when
 * the tab is backgrounded.
 */
const LIVE_REFRESH_MS = 10_000;

export const useMeta = () =>
  useQuery({ queryKey: queryKeys.meta, queryFn: api.meta, staleTime: Infinity });

export const useCreators = () =>
  useQuery({ queryKey: queryKeys.creators, queryFn: api.listCreators, staleTime: 5 * 60_000 });

export const useMatches = (creatorId: string | null) =>
  useQuery({
    queryKey: queryKeys.matches(creatorId ?? ''),
    queryFn: () => api.matches(creatorId!),
    enabled: Boolean(creatorId),
    // Campaigns disappear from this list when the worker closes them, so it has
    // to refresh on its own or a creator can bid into a closed auction.
    refetchInterval: LIVE_REFRESH_MS,
  });

export const useCampaign = (campaignId: string, creatorId: string | null) =>
  useQuery({
    queryKey: queryKeys.campaign(campaignId, creatorId ?? ''),
    queryFn: () => api.campaign(campaignId, creatorId!),
    enabled: Boolean(creatorId),
    refetchInterval: LIVE_REFRESH_MS,
  });

export const useMyBids = (creatorId: string | null) =>
  useQuery({
    queryKey: queryKeys.bids(creatorId ?? ''),
    queryFn: () => api.myBids(creatorId!),
    enabled: Boolean(creatorId),
    // Only poll while something can still change. Once every bid is decided
    // there is nothing for the worker to tell us.
    refetchInterval: (query) =>
      query.state.data?.bids.some((entry) => entry.bid.status === 'pending')
        ? LIVE_REFRESH_MS
        : false,
  });

export function usePlaceBid(campaignId: string, creatorId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { amountCents: number; message?: string }) =>
      api.placeBid(campaignId, { creatorId, ...input }),
    onSuccess: () => {
      // The bid changes the campaign's field, this creator's bid list, and the
      // ranking on every other card, so all three are invalidated together.
      void queryClient.invalidateQueries({ queryKey: queryKeys.campaign(campaignId, creatorId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches(creatorId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids(creatorId) });
    },
  });
}

export function useExpireCampaign(creatorId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (campaignId: string) => api.expireCampaign(campaignId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches(creatorId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids(creatorId) });
    },
  });
}
