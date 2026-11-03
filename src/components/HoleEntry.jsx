import { useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { yardsFor } from "./Scorecard";

const BASE_BTN =
  "rounded-xl border-2 px-4 py-4 text-lg font-semibold transition active:scale-95";

/**
 * One hole at a time: tap Birdie / Par / Bogey / Double, or More for any number.
 * onScore(value) records the score. Tapping a score does NOT advance; use the
 * arrows or the "Next hole" button, so a mis-tap is easy to fix.
 *
 * When trackStats is on, putts / fairway / GIR / penalty sit above the score buttons.
 * `stats` is this hole's current values (presets + edits); onStatChange(patch) updates them.
 */
export default function HoleEntry({
  hole, index, total, tee, score, onScore, onPrev, onNext,
  trackStats = false, stats, onStatChange,
}) {
  const [showOther, setShowOther] = useState(false);

  if (!hole) return null;
  const par = hole.Par;
  const yards = yardsFor(hole, tee);

  const quick = [
    { label: "Birdie", value: par - 1, idle: "border-fairway-light bg-white text-fairway hover:bg-fairway-light", on: "border-fairway bg-fairway text-white" },
    { label: "Par", value: par, idle: "border-line bg-white text-fairway-dark hover:bg-fairway-hover", on: "border-fairway-dark bg-fairway-dark text-white" },
    { label: "Bogey", value: par + 1, idle: "border-amber-200 bg-white text-amber-700 hover:bg-amber-50", on: "border-amber-500 bg-amber-500 text-white" },
    { label: "Double", value: par + 2, idle: "border-red-200 bg-white text-red-700 hover:bg-red-50", on: "border-red-600 bg-red-600 text-white" },
  ];
  const isQuick = quick.some(q => q.value === score);

  // 1 up to par + 5 covers ace through a rough day.
  const otherValues = Array.from({ length: par + 5 }, (_, i) => i + 1);

  const pick = value => {
    setShowOther(false);
    onScore(value);
  };

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => { setShowOther(false); onPrev(); }}
          disabled={index === 0}
          className="rounded-full p-2 text-muted hover:bg-fairway-light hover:text-fairway-dark disabled:opacity-30"
          aria-label="Previous hole"
        >
          <ChevronLeft size={28} />
        </button>

        <div className="text-center">
          <h2 className="heading-augusta text-3xl">Hole {hole.Hole}</h2>
          <p className="text-muted tabular-nums">
            Par {par}
           
          </p>
        </div>

        <button
          type="button"
          onClick={() => { setShowOther(false); onNext(); }}
          disabled={index === total - 1}
          className="rounded-full p-2 text-muted hover:bg-fairway-light hover:text-fairway-dark disabled:opacity-30"
          aria-label="Next hole"
        >
          <ChevronRight size={28} />
        </button>
      </div>

      {trackStats && stats && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Putts stepper */}
          <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-2 py-2">
            <button
              type="button"
              onClick={() => onStatChange({ putts: Math.max(stats.putts - 1, 0) })}
              disabled={stats.putts <= 0}
              className="rounded-lg p-2 text-fairway-dark hover:bg-fairway-light disabled:opacity-30"
              aria-label="One fewer putt"
            >
              <Minus size={18} />
            </button>
            <div className="text-center">
              <p className="font-display text-2xl font-semibold tabular-nums text-fairway-dark">{stats.putts}</p>
              <p className="label-augusta text-xs">Putts</p>
            </div>
            <button
              type="button"
              onClick={() => onStatChange({ putts: Math.min(stats.putts + 1, 9) })}
              disabled={stats.putts >= 9}
              className="rounded-lg p-2 text-fairway-dark hover:bg-fairway-light disabled:opacity-30"
              aria-label="One more putt"
            >
              <Plus size={18} />
            </button>
          </div>

          <StatToggle
            label="Fairway"
            on={stats.fairway}
            disabled={stats.fairway == null}
            disabledText="N/A on par 3"
            onClick={() => onStatChange({ fairway: !stats.fairway })}
          />
          <StatToggle label="Green in reg" on={stats.gir} onClick={() => onStatChange({ gir: !stats.gir })} />
          <StatToggle label="Penalty" on={stats.penalty} danger onClick={() => onStatChange({ penalty: !stats.penalty })} />
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
        {quick.map(q => (
          <button
            key={q.label}
            type="button"
            onClick={() => pick(q.value)}
            className={`${BASE_BTN} ${score === q.value ? q.on : q.idle}`}
          >
            {q.label}
            <span className="block text-sm font-normal opacity-70">{q.value}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => setShowOther(o => !o)}
          className={`${BASE_BTN} ${
            score != null && !isQuick
              ? "border-red-800 bg-red-800 text-white"
              : showOther
              ? "border-fairway-dark bg-white text-fairway-dark"
              : "border-line bg-white text-muted hover:bg-fairway-hover"
          }`}
        >
          More
          <span className="block text-sm font-normal opacity-70">
            {score != null && !isQuick ? score : "…"}
          </span>
        </button>
      </div>

      {showOther && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {otherValues.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => pick(v)}
              className={`h-12 w-12 rounded-full border-2 text-lg font-semibold transition active:scale-95 ${
                score === v
                  ? "border-fairway-dark bg-fairway-dark text-white"
                  : "border-line bg-white text-ink hover:bg-fairway-light"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {score != null && (
        <div className="mt-4 flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => onScore(null)}
            className="text-sm text-muted hover:text-danger hover:underline"
          >
            Clear hole {hole.Hole}
          </button>
          {index < total - 1 && (
            <button
              type="button"
              onClick={() => { setShowOther(false); onNext(); }}
              className="btn btn-primary flex items-center gap-1"
            >
              Next hole <ChevronRight size={18} />
            </button>
          )}
        </div>
      )}

    </div>
  );
}

// Checkbox-style button for a yes/no stat. `danger` styles "on" in red (penalties).
function StatToggle({ label, on, onClick, danger = false, disabled = false, disabledText }) {
  if (disabled) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-3 py-2 text-center">
        <p className="label-augusta text-xs">{label}</p>
        <p className="text-xs text-muted/70">{disabledText}</p>
      </div>
    );
  }
  const onStyle = danger
    ? "border-danger bg-danger/10 text-danger"
    : "border-fairway bg-fairway-light text-fairway-dark";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 font-semibold transition active:scale-95 ${
        on ? onStyle : "border-line bg-white text-muted hover:bg-fairway-hover"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded border-2 text-xs ${
          on
            ? danger
              ? "border-danger bg-danger text-white"
              : "border-fairway bg-fairway text-white"
            : "border-line bg-white"
        }`}
      >
        {on ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}
