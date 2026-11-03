import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RoundEntry, { toDateInput } from "./RoundEntry";
import { API_URL } from '../config'

/**
 * /rounds/:id/edit
 * Hole-by-hole rounds reuse RoundEntry (same buttons + scorecard, prefilled).
 * Quick-log rounds get a small totals form. Both save with PUT /api/rounds/:id.
 */
export default function EditRound() {
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

  const hasHoles = round.holes.length > 0;

  // Use the cached course for yardages/tees. Without it, rebuild bare holes
  // (number + par) from what the round saved.
  const course = round.course_data?.scorecard?.length
    ? round.course_data
    : { scorecard: round.holes.map(h => ({ Hole: h.hole_number, Par: h.par })), teeBoxes: [] };

  return (
    <div className="backdrop-augusta">
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label-augusta">Editing round</p>
            <h1 className="heading-augusta text-3xl">{round.course_name}</h1>
          </div>
          <button className="btn-primary" onClick={() => navigate(-1)}>Cancel</button>
        </div>

        {hasHoles ? (
          <RoundEntry
            course={course}
            courseId={round.course_id}
            osmName={round.course_name}
            initialRound={round}
          />
        ) : (
          <QuickEditForm round={round} />
        )}
      </div>
    </div>
  );
}

const FIELDS = [
  { key: "total_score", label: "Score", required: true },
  { key: "total_putts", label: "Putts" },
  { key: "fairways_hit", label: "Fairways hit" },
  { key: "fairways_possible", label: "Fairways possible" },
  { key: "greens_in_reg", label: "Greens in reg" },
  { key: "penalties", label: "Penalties" },
];

function QuickEditForm({ round }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(FIELDS.map(f => [f.key, round[f.key] ?? ""])),
    holes_played: round.holes_played ?? 18,
    date_played: toDateInput(round.date_played),
    notes: round.notes ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    // PUT is a full replace, so resend the course info the round already had.
    const body = {
      course_id: round.course_id,
      course_name: round.course_name,
      tee_name: round.tee_name,
      course_rating: round.course_rating,
      slope_rating: round.slope_rating,
      course_par: round.course_par,
      ...form,
      holes: [],
    };
    try {
      const res = await fetch(`${API_URL}/api/rounds/${round.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      navigate("/roundinfo");
    } catch (err) {
      setSaveError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="card-augusta mt-6 space-y-5 p-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {FIELDS.map(f => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="label-augusta">{f.label}</span>
            <input
              type="number"
              min="0"
              required={f.required}
              value={form[f.key]}
              onChange={e => set(f.key, e.target.value)}
              className="rounded-lg border border-line bg-white px-3 py-2 tabular-nums"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-sm">
          <span className="label-augusta">Holes</span>
          <select
            value={form.holes_played}
            onChange={e => set("holes_played", Number(e.target.value))}
            className="rounded-lg border border-line bg-white px-3 py-2"
          >
            <option value={18}>18</option>
            <option value={9}>9</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="label-augusta">Date played</span>
          <input
            type="date"
            required
            value={form.date_played}
            onChange={e => set("date_played", e.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="label-augusta">Notes</span>
        <textarea
          rows={3}
          value={form.notes}
          onChange={e => set("notes", e.target.value)}
          className="rounded-lg border border-line bg-white px-3 py-2"
        />
      </label>

      {saveError && <p className="text-sm text-danger">{saveError}</p>}
      <button type="submit" className="btn btn-primary w-full disabled:opacity-50" disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}
