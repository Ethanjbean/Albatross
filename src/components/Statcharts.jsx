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
 *
 * 9- and 18-hole rounds are charted separately (a toggle), since a 44 next to
 * an 88 on one line is noise, not a trend.
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
 
// Round axis bounds out to a "nice" step (1, 2, 5, 10, 20, 25...) so ticks read
// 80 / 85 / 90 instead of 39 / 54 / 69 / 92.
export function niceAxis(min, max, pad, targetTicks = 4) {
  const lo = min - pad;
  const hi = max + pad;
  const raw = Math.max((hi - lo) / (targetTicks - 1), 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let t = start; t <= end + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10);
  return { domain: [start, end], ticks };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
 
export function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
 
export function StatTooltip({ active, payload, label, unit }) {
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
 
/**
 * The one line chart both the Stats page and the Dashboard use, so they look
 * identical. Tuned to fill its card: y labels hug the left edge, the x axis
 * sits on the bottom, and the plot takes everything in between.
 * `avg` draws a faint dashed average line; `goal` draws a gold labeled one.
 */
export function TrendChart({ data, dataKey, stroke, domain, ticks, unit = "", avg, goal, className = "h-40" }) {
  return (
    <div className={`-ml-2 -mr-1 ${className}`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: "#6B7A72" }}
            axisLine={{ stroke: "#D9DED9" }}
            tickLine={false}
            tickMargin={6}
            height={22}
            minTickGap={24}
            padding={{ left: 6, right: 6 }}
          />
          <YAxis
            domain={domain}
            ticks={ticks}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#6B7A72" }}
            tickMargin={4}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          {avg != null && (
            <ReferenceLine y={avg} stroke={stroke} strokeDasharray="3 3" strokeOpacity={0.35} />
          )}
          {goal != null && (
            <ReferenceLine
              y={goal}
              stroke="#C9A646"
              strokeDasharray="4 4"
              label={{ value: `Goal ${goal}`, position: "insideTopRight", fill: "#C9A646", fontSize: 11 }}
            />
          )}
          <Tooltip content={props => <StatTooltip {...props} unit={unit} />} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={stroke}
            strokeWidth={2}
            dot={{ r: 3, fill: stroke, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatCard({ config, rounds }) {
  const values = rounds.map((r) => r[config.key]).filter((v) => v != null);
  const avg = average(values);

  if (!values.length) {
    return (
      <div className="card-augusta p-4 sm:p-6">
        <p className="label-augusta">{config.label}</p>
        <p className="mt-4 text-sm text-muted">No {config.label.toLowerCase()} data in this range.</p>
      </div>
    );
  }

  const { domain, ticks } = config.domain
    ? { domain: config.domain, ticks: [0, 25, 50, 75, 100] }
    : niceAxis(Math.min(...values), Math.max(...values), config.domainPad);
 
  const latest = values[values.length - 1];
  const delta = values.length > 1 ? latest - values[values.length - 2] : 0;
  const lowerIsBetter = config.key === "total_score" || config.key === "total_putts";
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
 
  return (
    <div className="card-augusta min-w-0 p-4 sm:p-5">
      <div className="flex items-baseline justify-between mb-4">
        <p className="label-augusta">
          {config.label}
        </p>
        <span className="text-xs text-muted">
          avg {avg.toFixed(1)}
          {config.unit}
        </span>
      </div>
 
      <TrendChart
        className="h-40"
        data={rounds}
        dataKey={config.key}
        stroke={config.stroke}
        domain={domain}
        ticks={ticks}
        unit={config.unit}
        avg={avg}
      />
 
      {values.length > 1 && (
        <p className={`text-xs mt-2 ${improved ? "text-fairway" : "text-red-500"}`}>
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
  const nineCount = rounds.filter(r => r.holes_played === 9).length;
  // Default to whichever length you've played more of.
  const [holes, setHoles] = useState(nineCount > rounds.length - nineCount ? 9 : 18);
  const hasBoth = nineCount > 0 && nineCount < rounds.length;
 
  const sorted = useMemo(
    () =>
      rounds
        .filter(r => !hasBoth || (r.holes_played ?? 18) === holes)
        .map(withDerivedStats)
        .sort((a, b) => new Date(a.date_played) - new Date(b.date_played)),
    [rounds, holes, hasBoth]
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
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="heading-augusta text-xl">Round history</h2>
        <div className="flex flex-wrap gap-2">
          {hasBoth && (
            <div className="mr-2 flex gap-2">
              {[18, 9].map(n => (
                <button
                  key={n}
                  onClick={() => setHoles(n)}
                  className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                    holes === n
                      ? "bg-fairway-dark text-white border-fairway-dark"
                      : "bg-white text-muted border-line hover:bg-fairway-light"
                  }`}
                >
                  {n} holes
                </button>
              ))}
            </div>
          )}
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
 
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {STAT_CONFIG.map((config) => (
          <StatCard key={config.key} config={config} rounds={visible} />
        ))}
      </div>
    </div>
  );
}
 