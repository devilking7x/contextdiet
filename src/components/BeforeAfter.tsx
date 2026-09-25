import { ArrowRight, TrendingDown } from "lucide-react";
import { FileEntry, Suggestion } from "../lib/analyze";
import { fmtInt, fmtPct, fmtTokens } from "../lib/format";

interface Props {
  files: FileEntry[];
  removedIds: Set<string>;
  suggestions: Suggestion[];
  selectedIds: Set<string>;
  windowSize: number;
}

/** Per-file effective tokens after applying removals + selected suggestions (capped). */
export function effectiveTokens(
  files: FileEntry[],
  removedIds: Set<string>,
  suggestions: Suggestion[],
  selectedIds: Set<string>,
): Map<string, number> {
  const byFile = new Map<string, number>();
  for (const s of suggestions) {
    if (!selectedIds.has(s.id) || s.fileId === "all") continue;
    if (removedIds.has(s.fileId)) continue;
    byFile.set(s.fileId, (byFile.get(s.fileId) ?? 0) + s.saveTokens);
  }

  const out = new Map<string, number>();
  for (const f of files) {
    if (removedIds.has(f.id)) {
      out.set(f.id, 0);
    } else {
      const save = Math.min(byFile.get(f.id) ?? 0, f.tokens);
      out.set(f.id, f.tokens - save);
    }
  }
  return out;
}

/** Cross-file (dedup) savings from selected suggestions. */
export function crossFileSavings(suggestions: Suggestion[], selectedIds: Set<string>): number {
  return suggestions
    .filter((s) => selectedIds.has(s.id) && s.fileId === "all")
    .reduce((sum, s) => sum + s.saveTokens, 0);
}

export function projectedTotal(
  files: FileEntry[],
  removedIds: Set<string>,
  suggestions: Suggestion[],
  selectedIds: Set<string>,
): number {
  const eff = effectiveTokens(files, removedIds, suggestions, selectedIds);
  let total = 0;
  for (const v of eff.values()) total += v;
  return Math.max(0, total - crossFileSavings(suggestions, selectedIds));
}

export default function BeforeAfter({ files, removedIds, suggestions, selectedIds, windowSize }: Props) {
  const before = files.reduce((s, f) => s + f.tokens, 0);
  const after = projectedTotal(files, removedIds, suggestions, selectedIds);
  const saved = before - after;
  const savedPct = before > 0 ? saved / before : 0;
  const eff = effectiveTokens(files, removedIds, suggestions, selectedIds);
  const savingOf = (f: FileEntry) => f.tokens - (eff.get(f.id) ?? f.tokens);
  const rows = [...files]
    .sort((a, b) => savingOf(b) - savingOf(a))
    .filter((f) => savingOf(f) > 0 || removedIds.has(f.id));

  return (
    <div className="rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-6">
      <div className="mb-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-300">
          <TrendingDown className="h-4 w-4 text-emerald-300" />
          Before / after simulation
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Projected savings from excluded files and selected trim suggestions
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Before</p>
          <p className="mt-2 font-mono text-3xl font-bold text-zinc-100">{fmtTokens(before)}</p>
          <p className="mt-1 font-mono text-xs text-zinc-500">
            {fmtInt(before)} tokens · {fmtPct(windowSize ? before / windowSize : 0)} of window
          </p>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all duration-700"
              style={{ width: `${Math.min(100, windowSize ? (before / windowSize) * 100 : 0)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10">
            <ArrowRight className="h-5 w-5 text-emerald-300" />
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">After</p>
          <p className="mt-2 font-mono text-3xl font-bold text-emerald-300">{fmtTokens(after)}</p>
          <p className="mt-1 font-mono text-xs text-zinc-500">
            {fmtInt(after)} tokens · {fmtPct(windowSize ? after / windowSize : 0)} of window
          </p>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
              style={{ width: `${Math.min(100, windowSize ? (after / windowSize) * 100 : 0)}%` }}
            />
          </div>
        </div>
      </div>

      {saved > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] px-5 py-3.5">
          <p className="text-sm font-semibold text-emerald-200">
            You&apos;d save {fmtTokens(saved)} tokens ({fmtInt(saved)})
          </p>
          <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 font-mono text-xs font-bold text-emerald-300">
            −{fmtPct(savedPct, 0)}
          </span>
          <p className="text-xs text-zinc-500">
            ≈ {fmtInt(saved / 4)} words freed for actual conversation
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-5 space-y-2">
          {rows.map((f) => {
            const afterF = eff.get(f.id) ?? f.tokens;
            const delta = f.tokens - afterF;
            return (
              <div key={f.id} className="flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0 truncate font-mono text-xs text-zinc-400 sm:w-56" title={f.name}>
                  {f.name}
                </span>
                <span className="font-mono text-xs text-zinc-500">{fmtTokens(f.tokens)}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                <span className="font-mono text-xs font-semibold text-emerald-300">{fmtTokens(afterF)}</span>
                <span className="font-mono text-[11px] text-emerald-500/70">−{fmtTokens(delta)}</span>
                {removedIds.has(f.id) && (
                  <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                    removed
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
