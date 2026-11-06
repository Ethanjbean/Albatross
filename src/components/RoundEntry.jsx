import { useState } from "react";
import HoleEntry from "./HoleEntry";
import Scorecard, { statsFor } from "./Scorecard";
import { useNavigate  } from "react-router-dom"
import { API_URL } from '../config'

/**
 * Owns everything about the round being entered: tee, scores, stats, current hole.
 * HoleEntry and Scorecard both read and write the same state, so tapping a
 * button and editing the card always stay in sync.
 *
 * Stats are optional (trackStats toggle). Each hole starts at the presets in
 * defaultStats (2 putts, fairway/GIR unselected, no penalty); `stats` only stores
 * what the user changed. Stats count toward totals once the hole has a score.
 *
 * Render with key={course id} so switching courses starts a fresh round.
 *
 * Edit mode: pass initialRound (the GET /api/rounds/:id response). The form
 * starts filled in with that round and saving sends a PUT instead of a POST.
 */

// Saved round_holes rows -> { scores, stats } in the shapes this form uses.
function stateFromHoles(roundHoles = []) {
  const scores = {};
  const stats = {};
  for (const h of roundHoles) {
    scores[h.hole_number] = h.strokes;
    if (h.putts != null) {
      stats[h.hole_number] = {
        putts: h.putts,
        fairway: h.fairway_hit,
        gir: h.gir,
        penalty: (h.penalties ?? 0) > 0,
      };
    }
  }
  return { scores, stats };
}

// Postgres DATEs come back as full timestamps; the date input wants YYYY-MM-DD.
export function toDateInput(value) {
  if (!value) return new Date().toLocaleDateString("en-CA");
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(value).toLocaleDateString("en-CA");
}

export default function RoundEntry({ course, courseId, osmName, initialRound = null }) {
  const holes = course?.scorecard ?? [];
  const teeBoxes = course?.teeBoxes ?? [];
  const navigate = useNavigate();
  const editing = initialRound != null;

  const [initial] = useState(() => stateFromHoles(initialRound?.holes));
  const [tee, setTee] = useState(initialRound?.tee_name ?? teeBoxes[0]?.tee ?? "");
  const [scores, setScores] = useState(initial.scores); // { [holeNumber]: strokes }
  const [stats, setStats] = useState(initial.stats); // { [holeNumber]: { putts?, fairway?, gir?, penalty? } }
  const [trackStats, setTrackStats] = useState(
    editing ? (initialRound.holes ?? []).some(h => h.putts != null) : true
  );
  const [current, setCurrent] = useState(0); // index into holes
  const [datePlayed, setDatePlayed] = useState(() => toDateInput(initialRound?.date_played)); // YYYY-MM-DD
  const [notes, setNotes] = useState(initialRound?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  if (holes.length === 0) {
    return <p className="mt-6 text-muted">No scorecard available for this course.</p>;
  }

  const hole = holes[current];


  function setScore(holeNumber, value) {
    setScores(prev => {
      const next = { ...prev };
      if (value == null) delete next[holeNumber];
      else next[holeNumber] = value;
      return next;
    });
  }

  function setStat(holeNumber, patch) {
    setStats(prev => ({ ...prev, [holeNumber]: { ...prev[holeNumber], ...patch } }));
  }

  // Button taps only record the score; moving on is a separate tap.
  function tapScore(value) {
    setScore(hole.Hole, value);
  }

  const played = holes.filter(h => scores[h.Hole] != null);
  const strokes = played.reduce((total, h) => total + scores[h.Hole], 0);
  const parPlayed = played.reduce((total, h) => total + h.Par, 0);
  const toPar = strokes - parPlayed;
  const toParLabel = toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : `${toPar}`;

  // Round stat totals, counted over holes with a score.
  const playedStats = played.map(h => statsFor(h, stats));
  const putts = playedStats.reduce((t, s) => t + s.putts, 0);
  const firOpps = playedStats.filter(s => s.fairway != null);
  const firHit = firOpps.filter(s => s.fairway).length;
  const girHit = playedStats.filter(s => s.gir).length;
  const penalties = playedStats.filter(s => s.penalty).length;

  // The backend only accepts complete 9- or 18-hole rounds.
  const canSave = played.length === 9 || played.length === 18;

  async function saveRound() {
    setSaving(true);
    setSaveError(null);
    const box = teeBoxes.find(t => t.tee === tee);
    // When editing a round whose course isn't cached, keep the rating it was saved with.
    const keepSaved = editing && tee === (initialRound.tee_name ?? "");
    const body = {
      course_id: courseId ?? null,
      course_name: osmName, // the name the user picked in search, not ryzegolf's
      tee_name: tee || null,
      course_rating: box?.handicap ?? (keepSaved ? initialRound.course_rating : null), // ryzegolf calls the rating "handicap"
      slope_rating: box?.slope ?? (keepSaved ? initialRound.slope_rating : null),
      date_played: datePlayed,
      notes: notes.trim() || null,
      holes: played.map(h => {
        const s = statsFor(h, stats);
        return {
          hole_number: h.Hole,
          par: h.Par,
          strokes: scores[h.Hole],
          putts: trackStats ? s.putts : null,
          fairway_hit: trackStats ? s.fairway : null,
          gir: trackStats ? s.gir : null,
          penalties: trackStats ? (s.penalty ? 1 : 0) : null,
        };
      }),
    };
    try {
      const url = editing ? `${API_URL}/api/rounds/${initialRound.id}` : `${API_URL}/api/rounds`;
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      navigate(editing ? `/rounds/${initialRound.id}` : "/");
    } catch (e) {
      setSaveError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-sm text-muted">
            {played.length} of {holes.length} holes entered
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={trackStats}
              onChange={e => setTrackStats(e.target.checked)}
              className="h-4 w-4 accent-fairway"
            />
            Track putts, fairways, GIR &amp; penalties
          </label>
        </div>

        {played.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {trackStats && (
              <p className="text-sm tabular-nums text-muted">
                <span className="font-semibold text-ink">{putts}</span> putts
                {firOpps.length > 0 && (
                  <> · <span className="font-semibold text-ink">{firHit}/{firOpps.length}</span> FIR</>
                )}
                {" · "}<span className="font-semibold text-ink">{girHit}/{played.length}</span> GIR
                {penalties > 0 && (
                  <> · <span className="font-semibold text-danger">{penalties}</span> pen</>
                )}
              </p>
            )}
            <p className="font-display text-2xl tabular-nums text-fairway-dark">
              <span className="font-semibold">{strokes}</span>
              <span
                className={`ml-2 font-medium ${
                  toPar < 0 ? "text-fairway" : toPar > 0 ? "text-amber-600" : "text-muted"
                }`}
              >
                ({toParLabel})
              </span>
            </p>
          </div>
        )}
      </div>

      <HoleEntry
        key={hole.Hole}
        hole={hole}
        index={current}
        total={holes.length}
        tee={tee}
        score={scores[hole.Hole]}
        onScore={tapScore}
        onPrev={() => setCurrent(c => Math.max(c - 1, 0))}
        onNext={() => setCurrent(c => Math.min(c + 1, holes.length - 1))}
        trackStats={trackStats}
        stats={statsFor(hole, stats)}
        onStatChange={patch => setStat(hole.Hole, patch)}
      />

      <Scorecard
        holes={holes}
        teeBoxes={teeBoxes}
        tee={tee}
        onTeeChange={setTee}
        scores={scores}
        onScoreChange={setScore}
        currentIndex={current}
        onHoleSelect={setCurrent}
        trackStats={trackStats}
        stats={stats}
        onStatChange={setStat}
      />
      <div className="mb-4 space-y-3">
        <label className="flex items-center gap-3 text-sm text-ink">
          <span className="label-augusta">Date played</span>
          <input
            type="date"
            value={datePlayed}
            onChange={e => setDatePlayed(e.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-2"
          />
        </label>

        <label className="block text-sm text-ink">
          <span className="label-augusta mb-1 block">Notes</span>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Conditions, what worked, what didn't..."
            className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2"
          />
        </label>

        {saveError && <p className="text-sm text-danger">{saveError}</p>}
        {!canSave && played.length > 0 && (
          <p className="text-sm text-muted">Enter all 9 or 18 holes to save.</p>
        )}
        
        <button
          className="btn btn-primary w-full disabled:opacity-50"
          onClick={saveRound}
          disabled={!canSave || saving}
        >
          {saving ? "Saving..." : editing ? "Save Changes" : "Add Round"}
        </button>
      </div>

    </div>
  );
}
