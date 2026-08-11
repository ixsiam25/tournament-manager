/**
 * Standard "circle method" round-robin pairing generator — pure
 * combinatorics, one correct output per team list, so unlike
 * `scheduleRandomizer.ts` there's nothing to "trust" here. Odd team counts
 * get a bye each round.
 */
export function generateRoundRobinPairs(teamIds: string[]): [string, string][] {
  const teams = [...teamIds];
  const hasBye = teams.length % 2 !== 0;
  if (hasBye) teams.push("__BYE__");
  const n = teams.length;
  if (n < 2) return [];

  const half = n / 2;
  const arr = [...teams];
  const pairs: [string, string][] = [];

  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== "__BYE__" && b !== "__BYE__") pairs.push([a, b]);
    }
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr.splice(0, arr.length, fixed, ...rest);
  }

  return pairs;
}

/** Double round-robin: every pair from the single round robin, plus the
 * same pairs again with home/away swapped. */
export function generateDoubleRoundRobinPairs(teamIds: string[]): [string, string][] {
  const single = generateRoundRobinPairs(teamIds);
  const reverse: [string, string][] = single.map(([a, b]) => [b, a]);
  return [...single, ...reverse];
}
