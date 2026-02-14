const MAX_LABEL_LENGTH = 60;

function sanitizeBaseName(input: string): string {
  const trimmed = input.trim();
  const segments = trimmed.split(/[\\/]/g);
  const lastSegment = segments[segments.length - 1] ?? trimmed;
  return lastSegment.replace(/\.[a-z0-9]{2,4}$/i, "");
}

function isAllCaps(word: string): boolean {
  const upper = word.toUpperCase();
  return word === upper && /[A-ZА-ЯЁ]/.test(word);
}

function formatWord(word: string): string {
  if (word.length === 0) return word;
  if (isAllCaps(word) && word.length <= 3) {
    return word;
  }
  const lowered = word.toLocaleLowerCase("ru-RU");
  return lowered.charAt(0).toLocaleUpperCase("ru-RU") + lowered.slice(1);
}

export function formatLabelShort(input: string): string {
  const baseName = sanitizeBaseName(input);
  const cleaned = baseName.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "(без названия)";

  const words = cleaned.split(" ").map(formatWord).join(" ").trim();
  if (words.length <= MAX_LABEL_LENGTH) return words;
  return `${words.slice(0, MAX_LABEL_LENGTH - 1)}…`;
}
