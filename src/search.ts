export function containsSearchPhrase(text: string, phrase: string): boolean {
  return normalize(text).includes(normalize(phrase));
}

function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}
