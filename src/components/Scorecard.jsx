// ryzegolf names tees "Updated_Blue" inside each hole but "Updated Blue" in teeBoxes.
export const teeName = s => (s ?? "").replace(/_/g, " ");

export const yardsFor = (hole, tee) =>
  Object.values(hole?.tees ?? {}).find(t => teeName(t.color) === teeName(tee))?.yards;

// Per-hole stat presets: 2 putts, fairway hit, green in regulation, no penalty.
// Par 3s have no fairway to hit, so fairway is null there and isn't counted.
export const defaultStats = hole => ({
  putts: 2,
  fairway: hole?.Par >= 4 ? true : null,
  gir: true,
  penalty: false,
});

// What a hole's stats are right now: the presets plus anything the user changed.
export const statsFor = (hole, stats) => ({ ...defaultStats(hole), ...(stats?.[hole?.Hole] ?? {}) });

// Text color for a score relative to par.
export const scoreColor = (score, par) => {
  if (score == null || par == null) return "text-ink";
  const diff = score - par;
  if (diff <= -2) return "text-yellow-600"; // eagle or better
  if (diff === -1) return "text-fairway"; // birdie
  if (diff === 0) return "text-ink"; // par
  if (diff === 1) return "text-amber-600"; // bogey
  return "text-red-600"; // double or worse
};

// Small color swatch next to the tee picker. Unknown tee names fall back to gray.
const TEE_SWATCH = {
  black: "bg-gray-900",
  blue: "bg-blue-600",
  white: "bg-white border border-gray-300",
  gold: "bg-yellow-500",
  yellow: "bg-yellow-400",
  red: "bg-red-600",
  green: "bg-green-600",
  silver: "bg-gray-300",
};
const swatchFor = name => {
  const key = Object.keys(TEE_SWATCH).find(k => teeName(name).toLowerCase().includes(k));
  return TEE_SWATCH[key] ?? "bg-gray-400";
};

/**
 * Full 18-hole card with an editable SCORE row.
 * Controlled: the parent owns tee, scores and the current hole.
 *   scores: { [holeNumber]: strokes }
 *
 * readOnly: for viewing a saved round. Scores and stats show as plain text,
 * the tee is a label instead of a dropdown, and nothing is clickable.
 */
export default function Scorecard({
  holes,
  teeBoxes,
  tee,
  onTeeChange,
  scores,
  onScoreChange,
  currentIndex,
  onHoleSelect,
  trackStats = false,
  stats,
  onStatChange,
  readOnly = false,
}) {
  const selectedBox = teeBoxes?.find(t => t.tee === tee);

  if (!holes?.length) {
    return <p className="mt-6 text-muted">No scorecard available for this course.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        {!readOnly && selectedBox && (
          // ryzegolf's "handicap" on a tee box is actually the course rating.
          <span className="text-sm text-muted">
            Rating <span className="font-semibold text-ink">{selectedBox.handicap}</span>
            {" / "}
            Slope <span className="font-semibold text-ink">{selectedBox.slope}</span>
          </span>
        )}

        {readOnly && tee && (
          <span className="flex items-center gap-2 text-sm text-ink">
            <span className={`h-3 w-3 rounded-full ${swatchFor(tee)}`} />
            {teeName(tee)}
          </span>
        )}

        {!readOnly && teeBoxes?.length > 0 && (
          <label className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${swatchFor(tee)}`} />
            <select
              value={tee}
              onChange={e => onTeeChange(e.target.value)}
              className="input-augusta px-3 py-1.5 text-sm"
            >
              {teeBoxes.map(t => (
                <option key={t.tee} value={t.tee}>{t.tee}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <CardTable
        holes={holes}
        tee={tee}
        scores={scores ?? {}}
        onScoreChange={onScoreChange}
        currentIndex={currentIndex}
        onHoleSelect={onHoleSelect}
        trackStats={trackStats}
        stats={stats}
        onStatChange={onStatChange}
        readOnly={readOnly}
      />
    </div>
  );
}

function CardTable({ holes, tee, scores, onScoreChange, currentIndex, onHoleSelect, trackStats, stats, onStatChange, readOnly }) {
  const sumYards = list => list.reduce((total, h) => total + (yardsFor(h, tee) ?? 0), 0);
  const sumPar = list => list.reduce((total, h) => total + (h.Par ?? 0), 0);
  // Blank until at least one hole in the range has a score.
  const sumScore = list => {
    const entered = list.filter(h => scores[h.Hole] != null);
    return entered.length ? entered.reduce((total, h) => total + scores[h.Hole], 0) : "";
  };

  const front = holes.slice(0, 9);
  const back = holes.slice(9);
  const hasBack = back.length > 0;
  const indexOf = h => holes.indexOf(h);
  const isCurrent = h => indexOf(h) === currentIndex;

  const cell = "border border-line px-1 py-2";
  const currentTint = h => (isCurrent(h) ? "bg-fairway-light/60" : "");
  const totalCell = `total ${cell} bg-fairway-light font-semibold text-fairway-dark`;
  const labelCell = `${cell} sticky left-0 z-10 bg-paper px-3 text-left font-display text-sm font-medium tracking-wider text-fairway-dark`;

  // One row: label, front nine, OUT, back nine, IN, TOT.
  // Hover tints every hole cell in the row (not the label or totals).
  const row = (label, renderHole, out, inn, tot) => (
    <tr className="[&:hover>td:not(.total)]:bg-fairway-hover">
      <th scope="row" className={labelCell}>{label}</th>
      {front.map(renderHole)}
      <td className={totalCell}>{out}</td>
      {hasBack && (
        <>
          {back.map(renderHole)}
          <td className={totalCell}>{inn}</td>
          <td className={totalCell}>{tot}</td>
        </>
      )}
    </tr>
  );

  const headCell = "border border-fairway-dark px-1 py-2 font-display font-medium tracking-wider";
  const headTotal = `${headCell} text-gold`;
  const holeHeader = h => readOnly ? (
    <th key={h.Hole} scope="col" className={headCell}>{h.Hole}</th>
  ) : (
    <th key={h.Hole} scope="col" className={`${headCell} p-0 ${isCurrent(h) ? "bg-fairway" : ""}`}>
      <button
        type="button"
        onClick={() => onHoleSelect?.(indexOf(h))}
        className="w-full py-2 hover:bg-fairway"
        title={`Go to hole ${h.Hole}`}
      >
        {h.Hole}
      </button>
    </th>
  );

  const handleInput = (h, raw) => {
    if (raw === "") return onScoreChange?.(h.Hole, null);
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    onScoreChange?.(h.Hole, Math.min(Math.max(n, 1), 15));
  };

  // ---------- Stats (only for holes that have a score) ----------
  const played = h => scores[h.Hole] != null;
  const statOf = h => statsFor(h, stats);
  const playedIn = list => list.filter(played);
  const blankIfNone = (list, value) => (playedIn(list).length ? value : "");

  const sumPutts = list => blankIfNone(list, playedIn(list).reduce((t, h) => t + statOf(h).putts, 0));
  const countTrue = (list, key) => playedIn(list).filter(h => statOf(h)[key] === true).length;
  // Fairways shown as hit/opportunities, since par 3s don't count.
  const firTotal = list => {
    const opps = playedIn(list).filter(h => statOf(h).fairway != null);
    return opps.length ? `${countTrue(list, "fairway")}/${opps.length}` : "";
  };
  const girTotal = list => blankIfNone(list, `${countTrue(list, "gir")}/${playedIn(list).length}`);
  const penTotal = list => blankIfNone(list, countTrue(list, "penalty"));

  const handlePutts = (h, raw) => {
    const n = parseInt(raw, 10);
    if (raw === "" || Number.isNaN(n)) return;
    onStatChange?.(h.Hole, { putts: Math.min(Math.max(n, 0), 9) });
  };

  const emptyCell = h => <td key={h.Hole} className={`${cell} ${currentTint(h)}`} />;

  // Tap to flip a yes/no stat right on the card.
  const toggleCell = (h, key, label, onMark, offMark, onColor) => {
    if (!played(h)) return emptyCell(h);
    const value = statOf(h)[key];
    if (value == null) {
      return <td key={h.Hole} className={`${cell} text-muted/50 ${currentTint(h)}`}>·</td>;
    }
    if (readOnly) {
      return (
        <td key={h.Hole} className={`${cell} font-semibold ${value ? onColor : "text-muted/60"}`}>
          {value ? onMark : offMark}
        </td>
      );
    }
    return (
      <td key={h.Hole} className={`border border-line p-0 ${currentTint(h)}`}>
        <button
          type="button"
          aria-pressed={value}
          aria-label={`${label} on hole ${h.Hole}: ${value ? "yes" : "no"}`}
          onClick={() => onStatChange?.(h.Hole, { [key]: !value })}
          className={`w-full py-2 font-semibold hover:bg-fairway-light ${value ? onColor : "text-muted/60"}`}
        >
          {value ? onMark : offMark}
        </button>
      </td>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
      <table className={`w-full table-fixed border-collapse text-center text-sm tabular-nums ${hasBack ? "min-w-[900px]" : "min-w-[500px]"}`}>
        <colgroup>
          <col className="w-20" />
          {front.map(h => <col key={h.Hole} />)}
          <col className="w-14" />
          {hasBack && back.map(h => <col key={h.Hole} />)}
          {hasBack && <col className="w-14" />}
          {hasBack && <col className="w-16" />}
        </colgroup>

        <thead className="bg-fairway-dark text-white">
          <tr>
            <th scope="col" className={`${headCell} sticky left-0 z-10 bg-fairway-dark px-3 text-left`}>HOLE</th>
            {front.map(holeHeader)}
            <th scope="col" className={headTotal}>OUT</th>
            {hasBack && (
              <>
                {back.map(holeHeader)}
                <th scope="col" className={headTotal}>IN</th>
                <th scope="col" className={headTotal}>TOT</th>
              </>
            )}
          </tr>
        </thead>

        <tbody className="text-ink">
          {row(
            "YARDS",
            h => <td key={h.Hole} className={`${cell} ${currentTint(h)}`}>{yardsFor(h, tee) ?? "-"}</td>,
            sumYards(front), sumYards(back), sumYards(holes)
          )}
          {row(
            "PAR",
            h => <td key={h.Hole} className={`${cell} font-semibold text-ink ${currentTint(h)}`}>{h.Par}</td>,
            sumPar(front), sumPar(back), sumPar(holes)
          )}
          {row(
            "HCP",
            h => <td key={h.Hole} className={`${cell} text-[0.8rem] text-muted ${currentTint(h)}`}>{h.Handicap}</td>,
            "", "", ""
          )}
          {row(
            "SCORE",
            h => readOnly ? (
              <td key={h.Hole} className={`${cell} text-base font-bold ${scoreColor(scores[h.Hole], h.Par)}`}>
                {scores[h.Hole] ?? ""}
              </td>
            ) : (
              <td key={h.Hole} className={`border border-line p-0 ${currentTint(h)}`}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={15}
                  aria-label={`Score for hole ${h.Hole}`}
                  value={scores[h.Hole] ?? ""}
                  onFocus={() => onHoleSelect?.(indexOf(h))}
                  onChange={e => handleInput(h, e.target.value)}
                  className={`w-full bg-transparent py-2 text-center text-base font-bold outline-none
                              focus:bg-fairway-light [appearance:textfield]
                              [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
                              ${scoreColor(scores[h.Hole], h.Par)}`}
                />
              </td>
            ),
            sumScore(front), sumScore(back), sumScore(holes)
          )}

          {trackStats && (
            <>
              {row(
                "PUTTS",
                h =>
                  played(h) && readOnly ? (
                    <td key={h.Hole} className={cell}>{statOf(h).putts}</td>
                  ) : played(h) ? (
                    <td key={h.Hole} className={`border border-line p-0 ${currentTint(h)}`}>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={9}
                        aria-label={`Putts on hole ${h.Hole}`}
                        value={statOf(h).putts}
                        onFocus={() => onHoleSelect?.(indexOf(h))}
                        onChange={e => handlePutts(h, e.target.value)}
                        className="w-full bg-transparent py-2 text-center outline-none focus:bg-fairway-light
                                   [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
                                   [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </td>
                  ) : emptyCell(h),
                sumPutts(front), sumPutts(back), sumPutts(holes)
              )}
              {row(
                "FIR",
                h => toggleCell(h, "fairway", "Fairway hit", "✓", "✕", "text-fairway"),
                firTotal(front), firTotal(back), firTotal(holes)
              )}
              {row(
                "GIR",
                h => toggleCell(h, "gir", "Green in regulation", "✓", "✕", "text-fairway"),
                girTotal(front), girTotal(back), girTotal(holes)
              )}
              {row(
                "PEN",
                h => toggleCell(h, "penalty", "Penalty", "●", "–", "text-danger"),
                penTotal(front), penTotal(back), penTotal(holes)
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
