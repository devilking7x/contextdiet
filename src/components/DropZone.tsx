import { FileUp, Sparkles, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

interface Props {
  onFiles: (files: FileList | File[]) => void;
  onLoadSamples: () => void;
  compact?: boolean;
}

const ACCEPT = ".md,.json,.txt,.mdc,.yaml,.yml";

export default function DropZone({ onFiles, onLoadSamples, compact }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
  };

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-white"
        >
          <FileUp className="h-4 w-4" />
          Add more files
        </button>
        <button
          onClick={onLoadSamples}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-500"
        >
          <Sparkles className="h-4 w-4" />
          Load sample bundle
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`group relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300 ${
        dragging
          ? "border-violet-400 bg-violet-500/[0.08] shadow-[0_0_60px_-12px_rgba(139,92,246,0.5)]"
          : "border-white/10 bg-white/[0.02] hover:border-violet-400/40 hover:bg-violet-500/[0.04]"
      }`}
    >
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col items-center px-6 py-16 text-center sm:py-20">
        <div
          className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-xl shadow-violet-600/30 transition-transform duration-300 ${
            dragging ? "scale-110" : "group-hover:scale-105"
          }`}
        >
          <UploadCloud className="h-8 w-8 text-white" strokeWidth={1.75} />
        </div>
        <h2 className="max-w-md text-2xl font-bold tracking-tight sm:text-3xl">
          Drop your <span className="text-violet-400">CLAUDE.md</span>, skills
          &amp; <span className="text-violet-400">.mcp.json</span>
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-400">
          Get real token counts, a per-file breakdown, and actionable trim
          suggestions. Everything is counted locally in your browser — no
          uploads, no backend.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <span className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition group-hover:bg-violet-500">
            Choose files
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLoadSamples();
            }}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white"
          >
            <Sparkles className="h-4 w-4 text-violet-300" />
            Try the sample bundle
          </button>
        </div>
        <p className="mt-6 font-mono text-[11px] text-zinc-600">
          .md · .json · .txt · .mcp.json — or just drag a folder&apos;s files in
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
