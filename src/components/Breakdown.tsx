import { Eye, EyeOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { FileEntry, KIND_META } from "../lib/analyze";
import { fmtBytes, fmtInt, fmtPct, fmtTokens } from "../lib/format";

const KIND_STYLES: Record<string, string> = {
  claude: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  skill: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  mcp: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  doc: "border-zinc-400/30 bg-zinc-400/10 text-zinc-300",
  json: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  text: "border-zinc-400/30 bg-zinc-400/10 text-zinc-400",
};

interface Props {
  files: FileEntry[];
  removedIds: Set<string>;
  onToggleRemoved: (id: string) => void;
  onRemoveFile: (id: string) => void;
}

export default function Breakdown({ files, removedIds, onToggleRemoved, onRemoveFile }: Props) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const sorted = [...files].sort((a, b) => b.tokens - a.tokens);
  const total = files.reduce((s, f) => s + f.tokens, 0);
  const max = sorted[0]?.tokens ?? 1;

  return (
    <div className="rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-zinc-300">
            Per-file token breakdown
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Largest offenders first · toggle files off to simulate removal
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-xs text-zinc-400">
          {files.length} file{files.length === 1 ? "" : "s"} · {fmtTokens(total)} tokens
        </span>
      </div>

      {/* bar chart */}
      <div className="mb-6 space-y-2.5">
        {sorted.map((f) => {
          const removed = removedIds.has(f.id);
          return (
            <div key={f.id} className={`flex items-center gap-3 ${removed ? "opacity-40" : ""}`}>
              <span className="w-40 shrink-0 truncate font-mono text-xs text-zinc-400 sm:w-56" title={f.name}>
                {f.name}
              </span>
              <div className="h-6 flex-1 overflow-hidden rounded-md bg-white/[0.04]">
                <div
                  className={`flex h-full items-center justify-end rounded-md bg-gradient-to-r from-violet-600 via-violet-500 to-fuchsia-500 pr-2 transition-all duration-500 ${
                    removed ? "grayscale" : ""
                  }`}
                  style={{ width: `${Math.max(3, (f.tokens / max) * 100)}%` }}
                >
                  {f.tokens / max > 0.18 && (
                    <span className="font-mono text-[10px] font-semibold text-white/90">
                      {fmtTokens(f.tokens)}
                    </span>
                  )}
                </div>
              </div>
              <span className="w-14 shrink-0 text-right font-mono text-[11px] text-zinc-500">
                {fmtPct(total ? f.tokens / total : 0, 0)}
              </span>
            </div>
          );
        })}
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">File</th>
              <th className="px-4 py-3 font-medium">Kind</th>
              <th className="px-4 py-3 text-right font-medium">Tokens</th>
              <th className="px-4 py-3 text-right font-medium">Share</th>
              <th className="px-4 py-3 text-right font-medium">Size</th>
              <th className="px-4 py-3 text-right font-medium">Simulate</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f, i) => {
              const removed = removedIds.has(f.id);
              return (
                <tr
                  key={f.id}
                  className={`border-b border-white/[0.04] last:border-0 transition ${
                    removed ? "bg-rose-500/[0.04] opacity-50" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">{i + 1}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setPreviewId(previewId === f.id ? null : f.id)}
                      className="flex items-center gap-1.5 font-mono text-xs text-zinc-200 hover:text-violet-300"
                      title="Toggle preview"
                    >
                      {previewId === f.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      <span className="max-w-[220px] truncate">{f.name}</span>
                    </button>
                    {previewId === f.id && (
                      <pre className="mt-2 max-h-40 max-w-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/40 p-3 font-mono text-[10px] leading-relaxed text-zinc-400">
                        {f.text.slice(0, 1500)}
                        {f.text.length > 1500 && "\n…"}
                      </pre>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${KIND_STYLES[f.kind]}`}
                      title={KIND_META[f.kind].hint}
                    >
                      {KIND_META[f.kind].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-zinc-100">
                    {fmtInt(f.tokens)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-zinc-400">
                    {fmtPct(total ? f.tokens / total : 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-zinc-500">
                    {fmtBytes(f.chars)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onToggleRemoved(f.id)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                          removed
                            ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                            : "border border-white/10 bg-white/[0.03] text-zinc-400 hover:border-rose-400/40 hover:text-rose-300"
                        }`}
                      >
                        {removed ? "Excluded" : "Exclude"}
                      </button>
                      <button
                        onClick={() => onRemoveFile(f.id)}
                        className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-white/[0.05] hover:text-rose-400"
                        title="Delete file from analysis"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
