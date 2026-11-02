import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import RoundEntry from "./RoundEntry";
import { API_URL } from '../config'

// The backend does the ryzegolf search, picks the right course and caches it.
// Response: { osm: { id, name, city, state }, course_id, course, match, cached }
//   course - ryzegolf's course object (scorecard, teeBoxes, ...) or null if it has no data
//   match  - "exact" | "loose" | "closest"
export default function LogRound() {
  // URL is /log-round/way/29357224 -> OSM id "way/29357224"
  const { osmType, osmNum } = useParams();
  const osmId = `${osmType}/${osmNum}`;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    const qs = new URLSearchParams({ osm_id: osmId });
    const token = localStorage.getItem("token");

    fetch(`${API_URL}/api/courses/lookup?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed (${r.status})`);
        }
        return r.json();
      })
      .then(setData)
      .catch(e => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [osmId]);

  const osm = data?.osm;
  const course = data?.course;
  const ryzeName = course?.name ?? course?.course_name ?? course?.courseName;

  return (
    <div className="backdrop-augusta">
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="heading-augusta text-3xl">{osm?.name ?? "Loading course..."}</h1>
        {osm && (osm.city || osm.state) && (
          <p className="text-muted">{[osm.city, osm.state].filter(Boolean).join(", ")}</p>
        )}

        {loading && <p className="mt-6 text-muted">Loading course...</p>}
        {error && <p className="mt-6 text-danger">{error}</p>}

        {data && !course && (
          <p className="mt-6 text-muted">No scorecard data found for this course yet.</p>
        )}

        {course && data.match === "closest" && (
          <p className="mt-6 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm text-ink">
            No exact match for "{osm.name}". Showing the closest result: {ryzeName}.
          </p>
        )}

        {course && (
          <RoundEntry
            key={osmId}
            course={course}
            courseId={data.course_id}
            osmName={osm.name}
          />
        )}
      </div>
    </div>
  );
}
