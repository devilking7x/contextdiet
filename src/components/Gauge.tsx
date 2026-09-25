import { fmtPct, fmtTokens } from "../lib/format";

interface Props {
  totalTokens: number;
  windowSize: number;
  onWindowChange: (n: number) => void;
}

const PRESETS = [50_000, 100_000, 200_000, 1_000_000];

const START = 150; // degrees
const SWEEP = 240;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  // SVG y-down: rotate so 150deg starts bottom-left
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad), _a: a };
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

export default function Gauge({ totalTokens, windowSize, onWindowChange }: Props) {
  const ratio = windowSize > 0 ? totalTokens / windowSize : 0;
  const status = ratio < 0.2 ? "ok" : ratio < 0.4 ? "warn" : "over";
  const color = status === "ok" ? "#34d399" : status === "warn" ? "#fbbf24" : "#fb7185";
  const label = status === "ok" ? "Lean" : status === "warn" ? "Getting heavy" : "Overweight";

  const cx = 130;
  const cy = 130;
  const r = 104;
  const valueAngle = START + SWEEP * Math.min(ratio, 1);
  const ruleAngle = START + SWEEP * 0.2;
  const rule = polar(cx, cy, r, ruleAngle);
  const needle = polar(cx, cy, r - 26, valueAngle);

  return (
    <div className="flex h-full flex-col rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-zinc-300">
          Context window usage
        </h3>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ color, backgroundColor: `${color}1a`, border: `1px solid ${color}33` }}
        >
          {label}
        </span>
      </div>

      <div className="relative mx-auto mt-2 w-full max-w-[280px]">
        <svg viewBox="0 0 260 210" className="w-full">
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          {/* track */}
          <path
            d={arcPath(cx, cy, r, START, START + SWEEP)}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={16}
            strokeLinecap="round"
          />
          {/* value */}
          {ratio > 0.002 && (
            <path
              d={arcPath(cx, cy, r, START, valueAngle)}
              fill="none"
              stroke="url(#gaugeGrad)"
              strokeWidth={16}
              strokeLinecap="round"
              style={{ transition: "all 0.6s cubic-bezier(0.22,1,0.36,1)" }}
            />
          )}
          {/* 20% rule marker */}
          <line
            x1={rule.x}
            y1={rule.y}
            x2={polar(cx, cy, r - 26, ruleAngle).x}
            y2={polar(cx, cy, r - 26, ruleAngle).y}
            stroke="#fff"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {/* needle */}
          <line
            x1={cx}
            y1={cy}
            x2={needle.x}
            y2={needle.y}
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            style={{ transition: "all 0.6s cubic-bezier(0.22,1,0.36,1)" }}
          />
          <circle cx={cx} cy={cy} r={9} fill="#0b0b12" stroke={color} strokeWidth={2.5} />
          <text
            x={rule.x}
            y={rule.y - 14}
            textAnchor="middle"
            fill="#a1a1aa"
            fontSize={10}
            fontWeight={600}
          >
            20% rule
          </text>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-2">
          <p className="font-mono text-3xl font-bold tracking-tight" style={{ color }}>
            {fmtPct(ratio)}
          </p>
          <p className="mt-1 font-mono text-xs text-zinc-500">
            {fmtTokens(totalTokens)} / {fmtTokens(windowSize)} tokens
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Context window size
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => onWindowChange(p)}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition ${
                windowSize === p
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                  : "border border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-white"
              }`}
            >
              {p >= 1_000_000 ? `${p / 1_000_000}M` : `${p / 1000}k`}
            </button>
          ))}
          <label className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
            <input
              type="number"
              min={1000}
              step={1000}
              value={windowSize}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isNaN(v) && v >= 1000) onWindowChange(v);
              }}
              className="w-20 bg-transparent font-mono text-xs text-zinc-200 outline-none"
            />
            <span className="font-mono text-[10px] text-zinc-600">custom</span>
          </label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          Rule of thumb: keep always-loaded context{" "}
          <span className="font-semibold text-zinc-300">under 20%</span> of the
          window so the model has room to think, plan and hold conversation
          history.
        </p>
      </div>
    </div>
  );
}
