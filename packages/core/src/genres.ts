/**
 * The genre vocabulary shared by creators and campaigns.
 *
 * Genres are modelled as a small closed set rather than free text because the
 * matching rules need to reason about *relatedness*, not just equality: a beauty
 * creator is a plausible fit for a fashion campaign, but not for a finance one.
 */
export const GENRES = [
  'fitness',
  'health',
  'beauty',
  'fashion',
  'gaming',
  'tech',
  'food',
  'travel',
  'music',
  'finance',
] as const;

export type Genre = (typeof GENRES)[number];

export function isGenre(value: string): value is Genre {
  return (GENRES as readonly string[]).includes(value);
}

/**
 * Genres that read as "close enough" to each other to a brand.
 *
 * Declared one-way and mirrored at module load, so the data below stays short
 * and cannot drift out of sync with itself.
 */
const ADJACENCY_SEED: ReadonlyArray<readonly [Genre, Genre]> = [
  ['fitness', 'health'],
  ['fitness', 'food'],
  ['health', 'food'],
  ['beauty', 'fashion'],
  ['fashion', 'travel'],
  ['gaming', 'tech'],
  ['tech', 'finance'],
  ['music', 'gaming'],
  ['travel', 'food'],
];

const ADJACENCY: ReadonlyMap<Genre, ReadonlySet<Genre>> = (() => {
  const map = new Map<Genre, Set<Genre>>(GENRES.map((g) => [g, new Set<Genre>()]));
  for (const [a, b] of ADJACENCY_SEED) {
    map.get(a)!.add(b);
    map.get(b)!.add(a);
  }
  return map;
})();

export type GenreRelation = 'exact' | 'adjacent' | 'unrelated';

export function relateGenres(creatorGenre: Genre, campaignGenre: Genre): GenreRelation {
  if (creatorGenre === campaignGenre) return 'exact';
  return ADJACENCY.get(creatorGenre)?.has(campaignGenre) ? 'adjacent' : 'unrelated';
}

/** Title-case a genre for display, e.g. `fitness` -> `Fitness`. */
export function genreLabel(genre: Genre): string {
  return genre.charAt(0).toUpperCase() + genre.slice(1);
}
