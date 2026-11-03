import { useEffect, useState } from "react";
import { Trophy, Medal, Target, Flag } from "lucide-react";
import { API_URL } from '../config'

// Reads GET /api/profiles/leaderboard?sort=handicap|rounds
// Response: { sort, me, players: [{ user_id, name, handicap_index, rounds_counted, rounds_played, rank }] }
// handicap_index is the cached index on profiles (from each round's tee rating/slope).
// rank is null for players with no index yet when sorting by handicap.

const SORTS = [
  { key: "handicap", label: "Handicap", icon: Target },
  { key: "rounds", label: "Rounds Played", icon: Flag },
];

const MEDAL = { 1: "text-gold", 2: "text-gray-400", 3: "text-amber-700" };

// Negative index = plus handicap, shown golf-style as "+1.2".
const formatIndex = h => (h == null ? "--" : h < 0 ? `+${Math.abs(h).toFixed(1)}` : h.toFixed(1));

function RankCell({ rank }) {
  if (MEDAL[rank]) {
    return (
      <span className="flex items-center gap-1.5 font-semibold text-fairway-dark">
        <Medal size={18} className={MEDAL[rank]} />
        {rank}
      </span>
    );
  }
  return <span className="pl-6 text-muted tabular-nums">{rank}</span>;
}

export default function Leaderboard() {
  const [sort, setSort] = useState("handicap");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/api/profiles/leaderboard?sort=${sort}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      signal: ctrl.signal,
    })
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? `Request failed (${r.status})`);
        // The old endpoint returned a bare array. Seeing one means the backend
        // is still running pre-change code.
        if (Array.isArray(body)) {
          throw new Error("Backend is running old code. Restart the server (node server.js) and refresh.");
        }
        return body;
      })
      .then(setData)
      .catch(e => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [sort]);

  const players = data?.players ?? [];
  const ranked = players.filter(p => p.rank != null);
  const unranked = players.filter(p => p.rank == null);

  return (
    <div className="backdrop-primary">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="heading-augusta flex items-center gap-3 text-3xl">
            <Trophy size={30} className="text-gold" />
            Leaderboard
          </h1>

          <div className="inline-flex rounded-lg border border-line bg-white p-1">
            {SORTS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                  sort === key ? "bg-fairway text-white" : "text-fairway-dark hover:bg-fairway-light"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </header>

        {loading && !data && <p className="text-muted">Loading leaderboard...</p>}
        {error && <p className="text-danger">{error}</p>}

        {data && !error && (
          <>
            <div className={`card-augusta overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
              <table className="w-full text-left">
                <thead className="bg-fairway-dark font-display text-sm uppercase tracking-wider text-paper">
                  <tr>
                    <th className="w-14 px-4 py-3 sm:w-20">Rank</th>
                    <th className="px-4 py-3">Player</th>
                    <th className={`px-4 py-3 text-right ${sort === "handicap" ? "text-gold" : ""}`}>Index</th>
                    <th className={`px-4 py-3 text-right ${sort === "rounds" ? "text-gold" : ""}`}>Rounds</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted">
                        Nobody has a handicap yet. Go log some rounds.
                      </td>
                    </tr>
                  )}
                  {ranked.map(p => {
                    const isMe = p.user_id === data.me;
                    return (
                      <tr
                        key={p.user_id}
                        className={`border-t border-line ${isMe ? "bg-gold/10 font-semibold" : "hover:bg-fairway-hover"}`}
                      >
                        <td className="px-4 py-3"><RankCell rank={p.rank} /></td>
                        <td className="px-4 py-3 text-fairway-dark">
                          {p.name}
                          {isMe && <span className="ml-2 text-xs text-gold">(you)</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatIndex(p.handicap_index)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{p.rounds_played}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {unranked.length > 0 && (
              <div className="mt-6">
                <h2 className="label-augusta mb-2">Not yet ranked: need 3 eligible rounds</h2>
                <ul className="flex flex-wrap gap-2">
                  {unranked.map(p => (
                    <li
                      key={p.user_id}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        p.user_id === data.me
                          ? "border-gold bg-gold/10 text-fairway-dark"
                          : "border-line bg-white text-muted"
                      }`}
                    >
                      {p.name} · {p.rounds_counted}/3
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sort === "handicap" && (
              <p className="mt-6 text-xs text-muted">
                Index (est.): WHS-style, from 18-hole rounds with tee rating and slope. 9-hole rounds
                and rounds without tee data don't count toward the index.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
