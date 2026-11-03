import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Trophy, Flag, Star, Target, CircleDot, AlertTriangle } from "lucide-react";
import { API_URL } from "../config";

// Profile = player card: milestones, career totals, ugly stats.
// Plan: "Albatross Profile Tab Plan" doc.
//
// Data: GET /api/profiles/me (header) and GET /api/profiles/me/stats (the rest).
// Stats come from hole-by-hole rounds only; lowest score counts any 18-hole round.

const MILESTONES = [
  { key: "hole_in_one", label: "First hole in one", icon: Star },
  { key: "albatross", label: "First albatross", icon: Trophy },
  { key: "eagle", label: "First eagle", icon: Trophy },
  { key: "birdie", label: "First birdie", icon: Flag },
  { key: "lowest_score", label: "Lowest score", icon: Target },
];

// The albatross card only appears once you've made one; showing a 0 forever
// for the rarest score in golf is just mean.
const TOTALS = [
  { key: "hole_in_ones", label: "Hole in ones" },
  { key: "albatrosses", label: "Albatrosses", hideAtZero: true },
  { key: "eagles", label: "Eagles" },
  { key: "birdies", label: "Birdies" },
  { key: "pars", label: "Pars" },
];

// basis = the field holding how many holes the stat was measured on.
// Putts and penalties are optional per hole, so they have their own counts.
const UGLY = [
  { key: "bogeys", label: "Bogeys" },
  { key: "double_bogeys", label: "Doubles" },
  { key: "triple_plus", label: "Triple+" },
  { key: "three_putts", label: "3-putts", basis: "putts_tracked" },
  { key: "penalty_strokes", label: "Penalty strokes", basis: "penalties_tracked", strokes: true },
];

// Used until the stats arrive, so the page has its shape instead of flashing
// the empty state.
const EMPTY = {
  holes_tracked: 0,
  milestones: {},
  totals: { hole_in_ones: 0, albatrosses: 0, eagles: 0, birdies: 0, pars: 0 },
  ugly: {},
};

// Dates arrive as 'YYYY-MM-DD'. new Date('2026-10-01') would read it as UTC
// midnight and show Sep 30 in US time zones, so build it as a local date.
const formatDate = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const pct = (n, of) => (of ? `${Math.round((100 * n) / of)}%` : "--");

export default function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null); // null = still loading
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
    const get = (path) =>
      fetch(`${API_URL}${path}`, { headers, signal: controller.signal }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
        return data;
      });

    get("/api/profiles/me").then(setProfile).catch(() => {});
    get("/api/profiles/me/stats")
      .then(setStats)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });

    return () => controller.abort();
  }, []);

  const name = profile?.display_name || profile?.username || "Golfer";
  const loading = stats === null && !error;
  const s = stats ?? EMPTY;
  const noHoles = stats !== null && s.holes_tracked === 0;
  const visibleTotals = TOTALS.filter((t) => !t.hideAtZero || s.totals[t.key] > 0);

  return (
    <div className="backdrop-primary">
      <div className="max-w-5xl mx-auto">
        {/* ---------- Header ---------- */}
        <div className="card-augusta p-6 mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label-augusta">Player card</p>
            <h1 className="heading-augusta text-3xl sm:text-4xl">{name}</h1>
          </div>
          <div className="flex gap-8 text-center">
            <div>
              <p className="label-augusta">Handicap</p>
              <p className="stat-augusta">{profile?.handicap_index ?? "--"}</p>
            </div>
            <div>
              <p className="label-augusta">Holes tracked</p>
              <p className="stat-augusta">{loading ? "--" : s.holes_tracked}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="card-augusta p-4 mb-8 text-sm text-danger">
            Couldn't load your stats: {error}
          </div>
        )}

        {noHoles && (
          <div className="card-augusta p-4 mb-8 flex items-center gap-3 text-sm text-muted">
            <CircleDot size={18} className="text-fairway shrink-0" />
            Log a round hole by hole to unlock milestones and stats.
          </div>
        )}

        {/* ---------- Milestones ---------- */}
        <section className="mb-10">
          <h2 className="heading-augusta text-xl mb-4">Milestones</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MILESTONES.map(({ key, label, icon: Icon }) => {
              const m = s.milestones[key];
              const unlocked = m != null;
              return (
                <button
                  key={key}
                  disabled={!unlocked}
                  onClick={() => unlocked && navigate(`/rounds/${m.round_id}`)}
                  className={`card-augusta p-4 flex items-center gap-4 text-left ${
                    unlocked ? "cursor-pointer" : "opacity-50 cursor-default"
                  }`}
                >
                  <div
                    className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center ${
                      unlocked ? "bg-gold/20 text-fairway-dark" : "bg-line text-muted"
                    }`}
                  >
                    {unlocked ? <Icon size={20} /> : <Lock size={18} />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display uppercase tracking-wide text-fairway-dark">{label}</p>
                    {unlocked ? (
                      <p className="text-sm text-muted">
                        {m.total_score != null && <span className="font-semibold text-ink">{m.total_score} · </span>}
                        {m.course_name}
                        {m.hole_number != null && ` · Hole ${m.hole_number}`}
                        {" · "}
                        {formatDate(m.date_played)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted">{loading ? "Loading…" : "Not yet"}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ---------- Career totals ---------- */}
        <section className="mb-10">
          <h2 className="heading-augusta text-xl mb-4">Career totals</h2>
          <div className={`grid grid-cols-2 gap-4 ${visibleTotals.length > 4 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
            {visibleTotals.map(({ key, label }) => (
              <div key={key} className="card-augusta p-4 text-center">
                <p className="label-augusta">{label}</p>
                <p className="stat-augusta">{loading ? "--" : s.totals[key]}</p>
                {!loading && s.holes_tracked > 0 && (
                  <p className="mt-1 text-xs text-muted">{pct(s.totals[key], s.holes_tracked)} of holes</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Ugly stats ---------- */}
        <section>
          <h2 className="heading-augusta text-xl mb-1 flex items-center gap-2">
            <AlertTriangle size={18} className="text-danger" />
            Ugly stats
          </h2>
          <p className="text-sm text-muted mb-4">The strokes you'd rather forget.</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {UGLY.map(({ key, label, basis, strokes }) => {
              const n = s.ugly[key] ?? 0;
              const of = basis ? s.ugly[basis] ?? 0 : s.holes_tracked;
              return (
                <div key={key} className="card-augusta p-4 text-center">
                  <p className="label-augusta">{label}</p>
                  <p className="stat-augusta text-danger">{loading ? "--" : n}</p>
                  {!loading && of > 0 && (
                    <p className="mt-1 text-xs text-muted">
                      {/* Penalty strokes can exceed holes, so a % makes no sense there */}
                      {strokes ? `over ${of} holes` : `${pct(n, of)} of ${basis ? `${of} ` : ""}holes`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
