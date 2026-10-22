import { toSearchText } from './normalize';
import type { Service } from './types';

/** Splits a query into normalised words. An empty result means "no search". */
export function tokenize(query: string): string[] {
  const text = toSearchText(query);
  return text ? text.split(' ') : [];
}

/** Every word must appear somewhere in the title, provider name or category. */
export function matchesQuery(service: Service, tokens: string[]): boolean {
  return tokens.every((token) => service.search.all.includes(token));
}

const startsWord = (haystack: string, token: string) =>
  haystack.startsWith(token) || haystack.includes(` ${token}`);

/**
 * Relevance of a matching service to the query. Where a word matches says how
 * likely it is to be what the customer meant:
 *   title, at the start of a word  3
 *   title, elsewhere               2
 *   category or subcategory        1.5
 *   provider name                  1
 * plus 3 when the whole query appears in the title as written.
 */
export function queryScore(service: Service, tokens: string[]): number {
  const { title, category, provider } = service.search;
  let score = 0;
  for (const token of tokens) {
    if (startsWord(title, token)) score += 3;
    else if (title.includes(token)) score += 2;
    else if (category.includes(token)) score += 1.5;
    else if (provider.includes(token)) score += 1;
  }
  if (tokens.length > 1 && title.includes(tokens.join(' '))) score += 3;
  return score;
}
