export const MODEL_FEATURE_NAMES = [
  'url_length',
  'hostname_length',
  'path_length',
  'dot_count',
  'hyphen_count',
  'digit_count',
  'special_character_count',
  'subdirectory_count',
  'has_https',
  'query_length',
] as const;

export type ModelFeatureName = (typeof MODEL_FEATURE_NAMES)[number];
export type ModelFeatureVector = Record<ModelFeatureName, number>;

export function normalizeUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) return value;
  if (value.startsWith('//')) return `http:${value}`;
  return value.includes('://') ? value : `http://${value}`;
}

export function extractModelFeatures(rawUrl: string): ModelFeatureVector {
  const url = normalizeUrl(rawUrl);
  const parsed = new URL(url);
  const authorityStart = url.indexOf('://') + 3;
  const authorityDelimiter = url.slice(authorityStart).search(/[/?#]/);
  const pathStart = authorityDelimiter < 0 ? url.length : authorityStart + authorityDelimiter;
  const pathname = url[pathStart] === '/'
    ? url.slice(pathStart).split(/[?#]/, 1)[0]
    : '';
  const pathSegments = pathname.split('/').filter(Boolean);
  return {
    url_length: url.length,
    hostname_length: parsed.hostname.length,
    path_length: pathname.length,
    dot_count: [...url].filter((character) => character === '.').length,
    hyphen_count: [...url].filter((character) => character === '-').length,
    digit_count: [...url].filter((character) => /\p{N}/u.test(character)).length,
    special_character_count: [...url].filter((character) => !/[\p{L}\p{N}]/u.test(character)).length,
    subdirectory_count: Math.max(pathSegments.length - 1, 0),
    has_https: Number(parsed.protocol.toLowerCase() === 'https:'),
    query_length: parsed.search.slice(1).length,
  };
}
