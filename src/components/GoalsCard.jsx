import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { API_URL } from '../config'

// One row per goal. `lowerIsBetter` decides whether beating the goal means
// being under it (score, putts) or over it (fairways, greens).
const GOALS = [
  { key: "score_goal", stat: "total_score", label: "Score", lowerIsBetter: true, min: 50, max: 150 },
  { key: "putt_goal", stat: "total_putts", label: "Putts", lowerIsBetter: true, min: 18, max: 54 },
  { key: "fairway_goal", stat: "fairways_hit", label: "Fairways", lowerIsBetter: false, min: 0, max: 14 },
  { key: "green_goal", stat: "greens_in_reg", label: "Greens", lowerIsBetter: false, min: 0, max: 18 },
];

// Average of a stat over full 18-hole rounds that recorded it.
function average(rounds, stat) {
  const values = rounds
    .filter(r => r.holes_played == null || r.holes_played === 18)
    .map(r => r[stat])
    .filter(v => v != null)
    .map(Number);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// How the recent average compares to the goal.
function status(avg, goal, lowerIsBetter) {
  if (avg == null || goal == null) return null;
  const diff = lowerIsBetter ? goal - avg : avg - goal; // positive = beating it
  if (diff >= 0) return { color: "text-fairway", bar: "bg-fairway", text: "On target" };
  const gap = Math.abs(diff).toFixed(1);
  const word = lowerIsBetter ? "over" : "under";
  // Within ~5% of the goal counts as close.
  if (Math.abs(diff) <= Math.max(1, goal * 0.05)) {
    return { color: "text-amber-600", bar: "bg-amber-500", text: `${gap} ${word}` };
  }
  return { color: "text-danger", bar: "bg-danger", text: `${gap} ${word}` };
}

/**
 * Dashboard card: each goal next to your recent average, editable in place.
 *   targets   - { score_goal, putt_goal, fairway_goal, green_goal }
 *   onSaved   - called with the saved targets so the dashboard (and the chart's
 *               goal line) updates without a refetch
 *   rounds    - recent rounds used for the averages
 */
export default function GoalsCard({ targets, rounds, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function startEdit() {
    setDraft(Object.fromEntries(GOALS.map(g => [g.key, targets[g.key] ?? ""])));
    setError(null);
    setEditing(true);
  }

  async function save() {
    // Validate before sending.
    const clean = {};
    for (const g of GOALS) {
      const n = Number(draft[g.key]);
      if (draft[g.key] === "" || !Number.isInteger(n) || n < g.min || n > g.max) {
        setError(`${g.label} goal must be a whole number from ${g.min} to ${g.max}.`);
        return;
      }
      clean[g.key] = n;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/targets`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: localStorage.getItem("token"),
        },
        body: JSON.stringify(clean),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      onSaved(clean);
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const roundCount = rounds.length;

  return (
    <div className="card-augusta p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="heading-augusta text-xl">Goals</h2>
          <p className="text-xs text-muted">
            {roundCount ? `vs. your last ${roundCount} round${roundCount === 1 ? "" : "s"}` : "Log a round to track progress"}
          </p>
        </div>

        {editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-lg p-2 text-muted hover:bg-fairway-light hover:text-ink"
              aria-label="Cancel editing goals"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-fairway px-3 py-2 text-sm font-semibold text-white hover:bg-fairway-dark disabled:opacity-50"
            >
              <Check size={16} />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-fairway hover:bg-fairway-light"
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
      </div>

      <ul className="space-y-4">
        {GOALS.map(g => {
          const goal = targets[g.key];
          const avg = average(rounds, g.stat);
          const s = status(avg, goal, g.lowerIsBetter);
          // Bar fill: how close the average is to the goal, capped at 100%.
          const pct =
            avg == null || !goal
              ? 0
              : Math.min(100, (g.lowerIsBetter ? goal / avg : avg / goal) * 100);

          return (
            <li key={g.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="label-augusta">{g.label}</span>

                {editing ? (
                  <input
                    type="number"
                    inputMode="numeric"
                    min={g.min}
                    max={g.max}
                    value={draft[g.key]}
                    onChange={e => {
                      setDraft(d => ({ ...d, [g.key]: e.target.value }));
                      setError(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") save();
                      if (e.key === "Escape") setEditing(false);
                    }}
                    aria-label={`${g.label} goal`}
                    className="input-augusta w-20 px-2 py-1 text-right font-display text-lg tabular-nums"
                  />
                ) : (
                  <span className="text-sm tabular-nums text-muted">
                    <span className="font-display text-2xl font-semibold text-fairway-dark">
                      {avg == null ? "–" : avg.toFixed(1)}
                    </span>
                    {" / "}
                    <span className="font-semibold text-ink">{goal ?? "–"}</span>
                  </span>
                )}
              </div>

              {!editing && (
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fairway-light">
                    <div className={`h-full rounded-full ${s?.bar ?? ""}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`w-20 text-right text-xs font-medium ${s?.color ?? "text-muted"}`}>
                    {s?.text ?? ""}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
    </div>
  );
}
