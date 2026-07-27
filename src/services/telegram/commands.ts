export const MAX_KEYWORDS_PER_SUBSCRIPTION = 3;

export function parseCommandArguments(text?: string): string[] {
  if (!text) return [];
  return text.trim().split(/\s+/).slice(1).filter(Boolean);
}

export function parseAddKeywords(text?: string): string[] {
  return parseCommandArguments(text).slice(0, MAX_KEYWORDS_PER_SUBSCRIPTION);
}

export function parseDeleteKeyword(text?: string): string | null {
  const keyword = parseCommandArguments(text).join(' ').trim();
  return keyword || null;
}
