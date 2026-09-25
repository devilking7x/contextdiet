import { Github, Leaf } from "lucide-react";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#07070c]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-500/25">
            <Leaf className="h-5 w-5 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <p className="text-[15px] font-bold leading-none tracking-tight">
              Context<span className="text-violet-400">Diet</span>
            </p>
            <p className="mt-1 text-[11px] leading-none text-zinc-500">
              Put your agent&apos;s context on a diet
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium text-emerald-300 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            100% local-first
          </span>
          <a
            href="https://github.com/devilking7x/contextdiet"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
}
