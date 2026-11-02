import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
 
/**
 * RoundStatsCharts
 *
 * Small-multiple line charts (score, putts, GIR%, fairways%) sharing a
 * common x-axis of rounds — deliberately not one combined chart, since
 * score (~70-100), putts (~26-38), and the two percentages (0-100) sit on
 * incompatible scales.
 *
 * Expects raw rows from GET /api/rounds/all:
 * { course_name, date_played, holes_played, total_score, total_putts,
 *   fairways_hit, fairways_possible, greens_in_reg, penalties, ... }
 *
 * Percentages are derived here from the round's own denominators:
 * - GIR% = greens_in_reg / holes_played
 * - Fairway% = fairways_hit / fairways_possible (falls back to 14 for
 *   quick-log rounds that didn't send fairways_possible)
 */

const DEFAULT_FAIRWAYS = 14;
const pct = (hit, possible) =>
  hit == null || !possible ? null : (hit / possible) * 100;

function withDerivedStats(round) {
  return {
    ...round,
    date: round.date_played,
    course: round.course_name,
    girPercent: pct(round.greens_in_reg, round.holes_played ?? 18),
    fairwaysPercent: pct(round.fairways_hit, round.fairways_possible ?? DEFAULT_FAIRWAYS),
  };
}

const STAT_CONFIG = [
  { key: "total_score", label: "Score", stroke: "#1E6B4E", unit: "", domainPad: 2 },
  { key: "total_putts", label: "Putts", stroke: "#3E7CB1", unit: "", domainPad: 1 },
  {
    key: "girPercent",
    label: "Greens in regulation",
    stroke: "#C9A646",
    unit: "%",
    domain: [0, 100],
  },
  {
    key: "fairwaysPercent",
    label: "Fairways hit",
    stroke: "#7FA650",
    unit: "%",
    domain: [0, 100],
  },
];
 
function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
 
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
 
function StatTooltip({ active, payload, label, unit }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-white border border-line rounded-lg shadow-card px-3 py-2 text-sm">
      <p className="font-medium text-ink">{formatDate(label)}</p>
      {point.course && <p className="text-muted text-xs">{point.course}</p>}
      <p className="text-ink">
        {Math.round(payload[0].value * 10) / 10}
        {unit}
      </p>
    </div>
  );
}
 
function StatCard({ config, rounds }) {
  const values = rounds.map((r) => r[config.key]).filter((v) => v != null);
  const avg = useMemo(() => average(values), [values]);
 
  const domain =
    config.domain ??
    [
      Math.min(...values) - config.domainPad,
      Math.max(...values) + config.domainPad,
    ];
 
  const latest = values[values.length - 1];
  const delta = values.length > 1 ? latest - values[values.length - 2] : 0;
  const lowerIsBetter = config.key === "total_score" || config.key === "total_putts";
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
 
  return (
    <div className="card-augusta p-6">
      <div className="flex items-baseline justify-between mb-4">
        <p className="label-augusta">
          {config.label}
        </p>
        <span className="text-xs text-muted">
          avg {avg.toFixed(1)}
          {config.unit}
        </span>
      </div>
 
      <div className="h-36">
        <ResponsiveContainer>
          <LineChart data={rounds} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: "#6B7A72" }}
              axisLine={{ stroke: "#D9DED9" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              domain={domain}
              tick={{ fontSize: 11, fill: "#6B7A72" }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <ReferenceLine y={avg} stroke={config.stroke} strokeDasharray="3 3" strokeOpacity={0.35} />
            <Tooltip content={(props) => <StatTooltip {...props} unit={config.unit} />} />
            <Line
              type="monotone"
              dataKey={config.key}
              stroke={config.stroke}
              strokeWidth={2}
              dot={{ r: 3, fill: config.stroke, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
 
      {values.length > 1 && (
        <p className={`text-xs mt-1 ${improved ? "text-fairway" : "text-red-500"}`}>
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)}
          {config.unit} vs last round
        </p>
      )}
    </div>
  );
}
 
export default function RoundStatsCharts({ rounds }) {
  const [range, setRange] = useState("all");
 
  const sorted = useMemo(
    () =>
      rounds
        .map(withDerivedStats)
        .sort((a, b) => new Date(a.date_played) - new Date(b.date_played)),
    [rounds]
  );
 
  const visible = useMemo(() => {
    if (range === "all") return sorted;
    return sorted.slice(-parseInt(range, 10));
  }, [sorted, range]);
 
  if (!rounds.length) {
    return (
      <div className="card-augusta p-6 text-center text-muted">
        No rounds logged yet.
      </div>
    );
  }
 
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="heading-augusta text-xl">Round history</h2>
        <div className="flex gap-2">
          {[
            { key: "5", label: "Last 5" },
            { key: "10", label: "Last 10" },
            { key: "all", label: "All" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setRange(opt.key)}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                range === opt.key
                  ? "bg-fairway-dark text-white border-fairway-dark"
                  : "bg-white text-muted border-line hover:bg-fairway-light"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
 
      <div className="grid grid-cols-2 gap-6">
        {STAT_CONFIG.map((config) => (
          <StatCard key={config.key} config={config} rounds={visible} />
        ))}
      </div>
    </div>
  );
}
 