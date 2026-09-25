import { AlertTriangle, Eraser, FileText, Gauge as GaugeIcon, PiggyBank, Scale } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import BeforeAfter, { projectedTotal } from "./components/BeforeAfter";
import Breakdown from "./components/Breakdown";
import DropZone from "./components/DropZone";
import Gauge from "./components/Gauge";
import Header from "./components/Header";
import Suggestions from "./components/Suggestions";
import { buildSuggestions, FileEntry, makeFileEntry, Suggestion } from "./lib/analyze";
import { fmtInt, fmtPct, fmtTokens } from "./lib/format";
import { SAMPLE_FILES } from "./samples";

const STORE_KEY = "contextdiet:v1";
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface Stored {
  windowSize: number;
  files: { name: string; text: string }[];
  removedIds: string[];
  selectedIds: string[];
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-5">
      <div className="flex items-center gap-2 text-zinc-500">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tight" style={{ color: accent }}>
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-500">{sub}</p>
    </div>
  );
}

export default function App() {
  const [files, setFiles] = useState<FileEntry[]>(() => {
    const s = loadStored();
    return (s?.files ?? []).map((f) => makeFileEntry(uid(), f.name, f.text));
  });
  const [windowSize, setWindowSize] = useState(() => loadStored()?.windowSize ?? 200_000);
  const [removedIds, setRemovedIds] = useState<Set<string>>(
    () => new Set(loadStored()?.removedIds ?? []),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(loadStored()?.selectedIds ?? []),
  );
  const [notice, setNotice] = useState<string | null>(null);

  const suggestions: Suggestion[] = useMemo(() => buildSuggestions(files), [files]);
  const totalTokens = useMemo(() => files.reduce((s, f) => s + f.tokens, 0), [files]);

  // Persist (debounced by React batching; files can be large but localStorage handles ~100KB fine)
  useEffect(() => {
    try {
      const payload: Stored = {
        windowSize,
        files: files.map((f) => ({ name: f.name, text: f.text })),
        removedIds: [...removedIds],
        selectedIds: [...selectedIds],
      };
      localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    } catch {
      /* storage full or unavailable — analysis still works */
    }
  }, [windowSize, files, removedIds, selectedIds]);

  // Auto-select high-impact new suggestions
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const s of suggestions) {
        if (!prev.has(s.id) && s.saveTokens >= 500) {
          next.add(s.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [suggestions]);

  const addTexts = (items: { name: string; text: string }[], replaceSamples: boolean) => {
    setFiles((prev) => {
      const base = replaceSamples ? prev.filter((f) => !f.id.startsWith("sample-")) : prev;
      const existing = new Set(base.map((f) => f.name));
      const fresh = items
        .filter((it) => !existing.has(it.name))
        .map((it) => makeFileEntry(replaceSamples ? `sample-${uid()}` : uid(), it.name, it.text));
      return [...base, ...fresh];
    });
    setNotice(null);
  };

  const handleFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    const skipped: string[] = [];
    const items: { name: string; text: string }[] = [];
    for (const f of arr) {
      if (f.size > MAX_FILE_BYTES) {
        skipped.push(f.name);
        continue;
      }
      try {
        items.push({ name: f.name || "untitled", text: await f.text() });
      } catch {
        skipped.push(f.name);
      }
    }
    if (items.length > 0) addTexts(items, false);
    if (skipped.length > 0) {
      setNotice(`Skipped ${skipped.length} file(s) (too large or unreadable): ${skipped.slice(0, 3).join(", ")}`);
    }
  };

  const loadSamples = () => addTexts(SAMPLE_FILES, true);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleRemoved = (id: string) =>
    setRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSuggestion = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearAll = () => {
    setFiles([]);
    setRemovedIds(new Set());
    setSelectedIds(new Set());
  };

  const afterTotal = projectedTotal(files, removedIds, suggestions, selectedIds);
  const potentialSave = totalTokens - afterTotal;
  const biggest = files.length > 0 ? [...files].sort((a, b) => b.tokens - a.tokens)[0] : null;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-5 pb-20">
        {files.length === 0 ? (
          <div className="animate-float-in mx-auto max-w-3xl pt-14">
            <div className="mb-8 text-center">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                What&apos;s eating your{" "}
                <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  context window?
                </span>
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-400">
                CLAUDE.md, skills and MCP configs load into every session. Count
                their real tokens, find the biggest offenders, and simulate the
                savings before you trim a single line.
              </p>
            </div>
            <DropZone onFiles={handleFiles} onLoadSamples={loadSamples} />
            {notice && (
              <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {notice}
              </p>
            )}
          </div>
        ) : (
          <div className="animate-float-in pt-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Your context{" "}
                  <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                    diet plan
                  </span>
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  Real token counts via gpt-tokenizer · counted locally, nothing uploaded
                </p>
              </div>
              <div className="flex items-center gap-3">
                <DropZone compact onFiles={handleFiles} onLoadSamples={loadSamples} />
                <button
                  onClick={clearAll}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:border-rose-400/40 hover:text-rose-300"
                >
                  <Eraser className="h-4 w-4" />
                  Clear
                </button>
              </div>
            </div>

            {notice && (
              <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {notice}
              </p>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              <Gauge totalTokens={totalTokens} windowSize={windowSize} onWindowChange={setWindowSize} />
              <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
                <StatCard
                  icon={<Scale className="h-4 w-4" />}
                  label="Total tokens"
                  value={fmtTokens(totalTokens)}
                  sub={`${fmtInt(totalTokens)} tokens across ${files.length} file${files.length === 1 ? "" : "s"}`}
                  accent="#c4b5fd"
                />
                <StatCard
                  icon={<GaugeIcon className="h-4 w-4" />}
                  label="Window share"
                  value={fmtPct(windowSize ? totalTokens / windowSize : 0)}
                  sub={totalTokens / windowSize < 0.2 ? "Under the 20% rule — nice" : "Over the 20% rule — time to trim"}
                  accent={totalTokens / windowSize < 0.2 ? "#6ee7b7" : "#fda4af"}
                />
                <StatCard
                  icon={<FileText className="h-4 w-4" />}
                  label="Biggest offender"
                  value={biggest ? fmtTokens(biggest.tokens) : "—"}
                  sub={biggest ? biggest.name : "No files yet"}
                  accent="#f0abfc"
                />
                <StatCard
                  icon={<PiggyBank className="h-4 w-4" />}
                  label="Projected savings"
                  value={fmtTokens(potentialSave)}
                  sub={potentialSave > 0 ? `${fmtPct(totalTokens ? potentialSave / totalTokens : 0, 0)} lighter after trims` : "Select suggestions below"}
                  accent="#6ee7b7"
                />
              </div>
            </div>

            <div className="mt-4">
              <Breakdown
                files={files}
                removedIds={removedIds}
                onToggleRemoved={toggleRemoved}
                onRemoveFile={removeFile}
              />
            </div>

            <div className="mt-4">
              <Suggestions suggestions={suggestions} selectedIds={selectedIds} onToggle={toggleSuggestion} />
            </div>

            <div className="mt-4">
              <BeforeAfter
                files={files}
                removedIds={removedIds}
                suggestions={suggestions}
                selectedIds={selectedIds}
                windowSize={windowSize}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-5 text-center">
          <p className="text-xs text-zinc-500">
            ContextDiet counts tokens with{" "}
            <span className="font-mono text-zinc-400">gpt-tokenizer</span> — the
            same BPE family as production tokenizers. Counts are estimates, not
            exact model internals.
          </p>
          <p className="text-xs text-zinc-600">
            100% client-side · MIT licensed · built for people who read their CLAUDE.md files
          </p>
        </div>
      </footer>
    </div>
  );
}
