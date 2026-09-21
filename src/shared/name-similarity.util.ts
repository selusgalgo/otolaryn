// Guards the "match by legacy_id, never by name" rule used across the
// legacy importers: legacy_id resolution is exact and deterministic, but
// the *source* data isn't — the same NUMHISTORIA can end up pointing to a
// different person between pacientes.xls and consultas.xls (the legacy
// system reused/reassigned historia numbers over the years). This is a
// last-line sanity check, not the primary matching mechanism: if the row's
// own name is nothing like the patient legacy_id actually resolved to,
// something upstream is wrong and the row should be skipped for manual
// review instead of silently attached to the wrong person.
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Tolerant of typos/accents (real legacy data: "Mnauel"/"Manuel",
// "Exequiel"/"Ezequiel") but rejects a genuinely different person — 0.3
// was picked by checking it against a real sample of pacientes/consultas
// legacy files: it let every typo-only difference through and caught the
// one real name collision found there.
const THRESHOLD = 0.3;

export function namesLookRelated(a: string, b: string): boolean {
  const normalizedA = normalize(a);
  const normalizedB = normalize(b);
  // Nothing to compare against (one side blank) — don't block on it, the
  // caller decides whether a blank name is itself a problem.
  if (!normalizedA || !normalizedB) return true;
  const distance = levenshtein(normalizedA, normalizedB);
  const maxLength = Math.max(normalizedA.length, normalizedB.length);
  return distance / maxLength <= THRESHOLD;
}
