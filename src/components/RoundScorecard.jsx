import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Scorecard from "./Scorecard";
import { API_URL } from '../config'

// Saved round -> the shapes Scorecard already uses.
//   scores: { [hole]: strokes }
//   stats:  { [hole]: { putts, fairway, gir, penalty } }
function toScorecardState(roundHoles) {
  const scores = {};
  const stats = {};
  for (const h of roundHoles) {
    scores[h.hole_number] = h.strokes;
    stats[h.hole_number] = {
      putts: h.putts,
      fairway: h.fairway_hit,
      gir: h.gir,
      penalty: (h.penalties ?? 0) > 0,
    };
  }
  return { scores, stats };
}

export default function RoundScorecard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [round, setRound] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${API_URL}/api/rounds/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      signal: ctrl.signal,
    })
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? `Request failed (${r.status})`);
        return body;
      })
      .then(setRound)
      .catch(e => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ctrl.abort();
  }, [id]);

  if (error) {
    return (
      <div className="backdrop-primary">
        <p className="text-danger">{error}</p>
        <button className="btn-primary mt-4" onClick={() => navigate("/roundinfo")}>← Back to rounds</button>
      </div>
    );
  }
  if (!round) return <div className="backdrop-primary"><p className="text-muted">Loading round...</p></div>;

  const played = new Set(round.holes.map(h => h.hole_number));
  // Use the cached course for yardages and hole handicaps. Without it,
  // build bare holes from what the round saved (par only, no yardages).
  const courseHoles = round.course_data?.scorecard?.filter(h => played.has(h.Hole));
  const holes = courseHoles?.length === played.size
    ? courseHoles
    : round.holes.map(h => ({ Hole: h.hole_number, Par: h.par }));

  const { scores, stats } = toScorecardState(round.holes);
  const trackedStats = round.holes.some(h => h.putts != null);

  const toPar = round.course_par != null ? round.total_score - round.course_par : null;
  const toParLabel = toPar == null ? "" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : `${toPar}`;

  const summary = [
    { label: "Score", value: round.total_score, sub: toParLabel },
    round.total_putts != null && { label: "Putts", value: round.total_putts },
    round.fairways_possible && { label: "Fairways", value: `${round.fairways_hit}/${round.fairways_possible}` },
    round.greens_in_reg != null && { label: "GIR", value: `${round.greens_in_reg}/${round.holes_played}` },
    round.penalties != null && { label: "Penalties", value: round.penalties },
    round.score_differential != null && { label: "Differential", value: round.score_differential },
  ].filter(Boolean);

  return (
    <div className="backdrop-primary">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="heading-augusta text-3xl">{round.course_name}</h1>
          <p className="text-muted">
            {new Date(round.date_played).toLocaleDateString()}
            {round.tee_name && ` · ${round.tee_name} tees`}
            {round.course_rating != null && ` · ${round.course_rating} / ${round.slope_rating}`}
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn-primary" onClick={() => navigate(`/rounds/${round.id}/edit`)}>Edit round</button>
          <button className="btn-primary" onClick={() => navigate("/roundinfo")}>← Back to rounds</button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {summary.map(s => (
          <div key={s.label} className="card-augusta flex flex-col items-center justify-center p-4 text-center">
            <p className="label-augusta">{s.label}</p>
            <p className="stat-augusta">
              {s.value}
              {s.sub && <span className="ml-1 text-base text-muted">({s.sub})</span>}
            </p>
          </div>
        ))}
      </div>

      {round.holes.length === 0 ? (
        <p className="card-augusta p-6 text-muted">
          This round was quick-logged, so there's no hole-by-hole scorecard.
        </p>
      ) : (
        <Scorecard
          readOnly
          holes={holes}
          teeBoxes={round.course_data?.teeBoxes ?? []}
          tee={round.tee_name ?? ""}
          scores={scores}
          trackStats={trackedStats}
          stats={stats}
        />
      )}

      {round.notes && (
        <div className="card-augusta mt-6 p-6">
          <p className="label-augusta mb-2">Notes</p>
          <p className="text-ink">{round.notes}</p>
        </div>
      )}
    </div>
  );
}
