import type { ChampionResult } from "@/lib/predictions";

/** Shown on the Champions Prediction page once the Final has been decided —
 * announces the actual champion and calls out everyone who predicted them
 * correctly, by name (voters who didn't leave a name are folded into the
 * "+N anonymous" count instead of being silently dropped). */
export function ChampionResultBanner({ result }: { result: ChampionResult }) {
  const accuracy =
    result.totalPredictions === 0
      ? 0
      : Math.round((result.totalCorrect / result.totalPredictions) * 100);

  return (
    <div className="mb-6 rounded-block-lg border-2 border-gold bg-gold/10 p-4 shadow-block sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-gold">🏆 Season IX Champions</p>
      <p className="heading-display mt-1 text-2xl sm:text-3xl">{result.championTeamName}</p>

      {result.totalCorrect === 0 ? (
        <p className="mt-3 text-sm text-muted">Nobody predicted this one — tough tournament to call.</p>
      ) : (
        <div className="mt-3">
          <p className="mb-2 text-sm text-muted">
            {result.totalCorrect} of {result.totalPredictions} predictions called it ({accuracy}%)
            {result.correctVoterNames.length > 0 ? " — congrats to:" : "."}
          </p>
          {result.correctVoterNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.correctVoterNames.map((name) => (
                <span
                  key={name}
                  className="rounded-block border-2 border-gold/50 bg-surface px-2.5 py-1 text-xs font-bold"
                >
                  {name}
                </span>
              ))}
              {result.anonymousCorrectCount > 0 && (
                <span className="rounded-block border-2 border-line px-2.5 py-1 text-xs text-muted">
                  +{result.anonymousCorrectCount} anonymous
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
