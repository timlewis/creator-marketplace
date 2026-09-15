import { describe, expect, it } from 'vitest';
import { FIT_WEIGHTS, rankMatches, scoreMatch } from '../src/matching.js';
import type { FitComponentKey } from '../src/types.js';
import { campaign, creator } from './factories.js';

const pointsFor = (key: FitComponentKey, ...args: Parameters<typeof scoreMatch>) =>
  scoreMatch(...args).fit.components.find((c) => c.key === key)!.points;

describe('fit scoring: genre', () => {
  it('awards full marks for an exact genre match', () => {
    expect(pointsFor('genre', creator({ genre: 'fitness' }), campaign({ targetGenre: 'fitness' })))
      .toBe(FIT_WEIGHTS.genre);
  });

  it('awards partial credit for an adjacent genre', () => {
    // A beauty creator is a credible fit for a fashion brief, so they should
    // surface above unrelated creators rather than being lumped in with them.
    expect(pointsFor('genre', creator({ genre: 'beauty' }), campaign({ targetGenre: 'fashion' })))
      .toBe(24);
  });

  it('still awards a floor for an unrelated genre', () => {
    // Not zero: a big, highly-engaged creator from another vertical is worth
    // showing to a brand, just not worth ranking above an on-genre one.
    expect(pointsFor('genre', creator({ genre: 'finance' }), campaign({ targetGenre: 'fitness' })))
      .toBe(8);
  });

  it('treats adjacency as symmetric', () => {
    const forwards = pointsFor('genre', creator({ genre: 'gaming' }), campaign({ targetGenre: 'tech' }));
    const backwards = pointsFor('genre', creator({ genre: 'tech' }), campaign({ targetGenre: 'gaming' }));
    expect(forwards).toBe(backwards);
  });
});

describe('fit scoring: engagement', () => {
  const target = campaign({ minEngagementRate: 0.03 });

  it('scores zero at or below half the brand target', () => {
    expect(pointsFor('engagement', creator({ engagementRate: 0.015 }), target)).toBe(0);
  });

  it('scores full marks at or above double the brand target', () => {
    expect(pointsFor('engagement', creator({ engagementRate: 0.06 }), target)).toBe(
      FIT_WEIGHTS.engagement,
    );
  });

  it('does not keep rewarding engagement past the ceiling', () => {
    // Past 2x the target the brand's need is met; an outlier rate is more often
    // a small-audience artefact than genuine extra value.
    expect(pointsFor('engagement', creator({ engagementRate: 0.5 }), target)).toBe(
      FIT_WEIGHTS.engagement,
    );
  });

  it('awards full marks when the brand sets no engagement bar', () => {
    const noBar = campaign({ minEngagementRate: 0 });
    expect(pointsFor('engagement', creator({ engagementRate: 0.001 }), noBar)).toBe(
      FIT_WEIGHTS.engagement,
    );
  });
});

describe('fit scoring: reach headroom', () => {
  const target = campaign({ minFollowers: 50_000 });

  it('scores zero for a creator exactly at the minimum', () => {
    // Meeting the bar earns eligibility, not credit. Headroom is what is scored.
    expect(pointsFor('reach', creator({ followerCount: 50_000 }), target)).toBe(0);
  });

  it('scores full marks at eight times the minimum', () => {
    expect(pointsFor('reach', creator({ followerCount: 400_000 }), target)).toBe(FIT_WEIGHTS.reach);
  });

  it('compresses reach on a log scale so outliers do not dominate', () => {
    // A 40x creator must not bury a solid 4x one. Linear scaling would let raw
    // audience size swamp genre and engagement combined.
    const quadruple = pointsFor('reach', creator({ followerCount: 200_000 }), target);
    const enormous = pointsFor('reach', creator({ followerCount: 2_000_000 }), target);

    expect(quadruple).toBe(17);
    expect(enormous - quadruple).toBeLessThan(FIT_WEIGHTS.reach / 2);
  });
});

describe('fit score totals', () => {
  it('always equals the sum of its components', () => {
    // The UI renders the breakdown under the headline number. A total that does
    // not visibly add up reads as a broken product.
    const result = scoreMatch(creator({ followerCount: 137_000, engagementRate: 0.051 }), campaign());
    const summed = result.fit.components.reduce((total, c) => total + c.points, 0);

    expect(result.fit.score).toBe(summed);
  });

  it('cannot exceed 100', () => {
    const perfect = scoreMatch(
      creator({ genre: 'fitness', followerCount: 10_000_000, engagementRate: 0.9 }),
      campaign({ targetGenre: 'fitness' }),
    );
    expect(perfect.fit.score).toBe(100);
  });
});

describe('eligibility', () => {
  it('blocks a creator below the follower minimum, and says by how much', () => {
    const result = scoreMatch(
      creator({ followerCount: 32_400 }),
      campaign({ minFollowers: 50_000 }),
    );

    expect(result.eligible).toBe(false);
    expect(result.ineligibility).toEqual({
      code: 'below_min_followers',
      message: 'Needs 50,000 followers - you have 32,400',
    });
  });

  it('blocks an off-genre creator only when the brand asked for strict genre', () => {
    const offGenre = creator({ genre: 'beauty' });

    expect(scoreMatch(offGenre, campaign({ targetGenre: 'fitness', strictGenre: false })).eligible)
      .toBe(true);
    expect(scoreMatch(offGenre, campaign({ targetGenre: 'fitness', strictGenre: true })).eligible)
      .toBe(false);
  });

  it('treats strict genre as exact, not merely adjacent', () => {
    const adjacent = creator({ genre: 'health' });
    const result = scoreMatch(adjacent, campaign({ targetGenre: 'fitness', strictGenre: true }));

    expect(result.ineligibility).toEqual({
      code: 'genre_restricted',
      message: 'Open to Fitness creators only',
    });
  });

  it('reports only the follower gap when a creator fails both gates', () => {
    // Listing every way someone falls short is discouraging and no more useful
    // than naming the nearest obstacle.
    const result = scoreMatch(
      creator({ genre: 'finance', followerCount: 1_000 }),
      campaign({ targetGenre: 'fitness', strictGenre: true, minFollowers: 50_000 }),
    );

    expect(result.ineligibility?.code).toBe('below_min_followers');
  });

  it('still scores fit for an ineligible campaign', () => {
    // "You would score 72 here once you pass 50k" turns a locked card into a
    // reason to come back, instead of a dead end.
    const result = scoreMatch(
      creator({ genre: 'fitness', followerCount: 10_000, engagementRate: 0.06 }),
      campaign({ targetGenre: 'fitness', minFollowers: 50_000 }),
    );

    expect(result.eligible).toBe(false);
    expect(result.fit.score).toBeGreaterThan(0);
  });
});

describe('rankMatches', () => {
  it('puts every eligible campaign ahead of every ineligible one', () => {
    const me = creator({ genre: 'fitness', followerCount: 60_000, engagementRate: 0.04 });
    const ranked = rankMatches(me, [
      campaign({ id: 'locked', targetGenre: 'fitness', minFollowers: 500_000 }),
      campaign({ id: 'open', targetGenre: 'finance', minFollowers: 10_000 }),
    ]);

    // The open campaign scores worse on genre but is the only one they can act
    // on, so it must still come first.
    expect(ranked.map((r) => r.campaign.id)).toEqual(['open', 'locked']);
  });

  it('orders eligible campaigns by fit, best first', () => {
    const me = creator({ genre: 'fitness' });
    const ranked = rankMatches(me, [
      campaign({ id: 'unrelated', targetGenre: 'finance' }),
      campaign({ id: 'exact', targetGenre: 'fitness' }),
      campaign({ id: 'adjacent', targetGenre: 'health' }),
    ]);

    expect(ranked.map((r) => r.campaign.id)).toEqual(['exact', 'adjacent', 'unrelated']);
  });

  it('breaks equal fit by the soonest deadline', () => {
    // A great match closing in ten minutes needs attention before an equally
    // good one closing next week.
    const ranked = rankMatches(creator(), [
      campaign({ id: 'later', biddingDeadline: new Date('2026-03-01T00:00:00.000Z') }),
      campaign({ id: 'sooner', biddingDeadline: new Date('2026-02-01T00:00:00.000Z') }),
    ]);

    expect(ranked.map((r) => r.campaign.id)).toEqual(['sooner', 'later']);
  });

  it('breaks an equal fit and deadline by the larger budget', () => {
    const ranked = rankMatches(creator(), [
      campaign({ id: 'small', budgetCents: 100_000 }),
      campaign({ id: 'large', budgetCents: 900_000 }),
    ]);

    expect(ranked.map((r) => r.campaign.id)).toEqual(['large', 'small']);
  });

  it('returns the caller"s own campaign objects untouched', () => {
    // Generic in the campaign type so the API can pass full database rows
    // through and render them, rather than re-joining on id afterwards.
    const row = { ...campaign({ id: 'c1' }), brandName: 'Acme', title: 'Spring push' };
    const [ranked] = rankMatches(creator(), [row]);

    expect(ranked!.campaign.brandName).toBe('Acme');
  });
});
