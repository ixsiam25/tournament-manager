/** "1 player", "2 players" — so counts never read "1 players". */
export function plural(n: number, word: string, many?: string): string {
  return `${n} ${n === 1 ? word : (many ?? word + "s")}`;
}
