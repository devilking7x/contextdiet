import { Lightbulb, Scissors } from "lucide-react";
import { Suggestion } from "../lib/analyze";
import { fmtInt, fmtTokens } from "../lib/format";

interface Props {
  suggestions: Suggestion[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}

const SEV_STYLES: Record<Suggestion["severity"], string> = {
  high: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  low: "border-sky-400/30 bg-sky-400/10 text-sky-300",
};

export default function Suggestions({ suggestions, selectedIds, onToggle }: Props) {
  const totalSave = suggestions
    .filter((s) => selectedIds.has(s.id))
    .reduce((sum, s) => sum + s.saveTokens, 0);

  return (
    <div className="rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-300">
            <Lightbulb className="h-4 w-4 text-amber-300" />
            Trim suggestions
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Ordered by impact · check the ones you&apos;ll act on
          </p>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 font-mono text-xs font-semibold text-emerald-300">
          −{fmtTokens(totalSave)} selected
        </span>
      </div>

      {suggestions.length === 0 ? (
        <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center text-sm text-zinc-500">
          Nothing to trim — this bundle is already lean. 🎉
        </p>
      ) : (
        <ul className="space-y-3">
          {suggestions.map((s) => {
            const selected = selectedIds.has(s.id);
            return (
              <li
                key={s.id}
                onClick={() => onToggle(s.id)}
                className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                  selected
                    ? "border-violet-400/30 bg-violet-500/[0.07] shadow-[0_0_24px_-8px_rgba(139,92,246,0.4)]"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.035]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                      selected
                        ? "border-violet-400 bg-violet-500 text-white"
                        : "border-white/20 bg-transparent"
                    }`}
                  >
                    {selected && <Scissors className="h-3 w-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-100">{s.title}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEV_STYLES[s.severity]}`}
                      >
                        {s.severity}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-zinc-500">{s.fileName}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{s.detail}</p>
                  </div>
                  <div className="shrink-0 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1.5 text-right">
                    <p className="font-mono text-sm font-bold text-emerald-300">
                      −{fmtTokens(s.saveTokens)}
                    </p>
                    <p className="font-mono text-[10px] text-emerald-500/70">
                      {fmtInt(s.saveTokens)} tok
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
