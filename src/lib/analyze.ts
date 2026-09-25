import { countTokens } from "./tokenizer";

export type FileKind = "claude" | "skill" | "mcp" | "doc" | "json" | "text";

export interface FileEntry {
  id: string;
  name: string;
  kind: FileKind;
  text: string;
  chars: number;
  tokens: number;
}

export interface Suggestion {
  id: string;
  /** file id, or "all" for cross-file suggestions */
  fileId: string;
  fileName: string;
  title: string;
  detail: string;
  saveTokens: number;
  severity: "high" | "medium" | "low";
}

export const KIND_META: Record<FileKind, { label: string; hint: string }> = {
  claude: { label: "CLAUDE.md", hint: "Loaded at every session start" },
  skill: { label: "Skill", hint: "SKILL.md loads fully into context" },
  mcp: { label: "MCP config", hint: "Server defs + tool schemas cost context" },
  doc: { label: "Markdown", hint: "" },
  json: { label: "JSON", hint: "" },
  text: { label: "Text", hint: "" },
};

export function detectKind(name: string): FileKind {
  const base = name.split("/").pop() ?? name;
  if (/^(CLAUDE|AGENTS)\.md$/i.test(base)) return "claude";
  if (/^SKILL\.md$/i.test(base)) return "skill";
  if (/\.mcp\.json$/i.test(base)) return "mcp";
  if (/\.md$/i.test(base)) return "doc";
  if (/\.json$/i.test(base)) return "json";
  return "text";
}

export function makeFileEntry(id: string, name: string, text: string): FileEntry {
  return {
    id,
    name,
    kind: detectKind(name),
    text,
    chars: text.length,
    tokens: countTokens(text),
  };
}

function severityFor(saveTokens: number): Suggestion["severity"] {
  if (saveTokens >= 2000) return "high";
  if (saveTokens >= 500) return "medium";
  return "low";
}

function codeBlockTokens(text: string): number {
  const blocks = text.match(/```[\s\S]*?```/g);
  if (!blocks || blocks.length === 0) return 0;
  return countTokens(blocks.join("\n"));
}

function minifiedJsonSavings(text: string): number {
  try {
    const min = JSON.stringify(JSON.parse(text));
    const save = countTokens(text) - countTokens(min);
    return save > 0 ? save : 0;
  } catch {
    return 0;
  }
}

function mcpServerCount(text: string): number {
  try {
    const parsed = JSON.parse(text) as { mcpServers?: Record<string, unknown> };
    return parsed.mcpServers ? Object.keys(parsed.mcpServers).length : 0;
  } catch {
    return 0;
  }
}

function buildFileSuggestions(file: FileEntry): Suggestion[] {
  const out: Suggestion[] = [];
  const { tokens, kind, text, id, name } = file;

  if (kind === "claude") {
    if (tokens > 12000) {
      out.push({
        id: `${id}:claude-split`,
        fileId: id,
        fileName: name,
        title: "Split this CLAUDE.md into focused skill files",
        detail:
          "Files this large usually mix project docs, runbooks and style guides. Move per-domain knowledge into skills that load on demand instead of every session. Realistic saving: ~35%.",
        saveTokens: Math.round(tokens * 0.35),
        severity: "high",
      });
    } else if (tokens > 4000) {
      out.push({
        id: `${id}:claude-trim`,
        fileId: id,
        fileName: name,
        title: "Trim CLAUDE.md to session-critical essentials",
        detail:
          "Keep only what the agent needs in the first 5 minutes: golden rules, repo layout, key commands. Move reference tables (endpoints, env vars) into docs the agent can read on demand. Realistic saving: ~25%.",
        saveTokens: Math.round(tokens * 0.25),
        severity: severityFor(tokens * 0.25),
      });
    } else if (tokens > 1500) {
      out.push({
        id: `${id}:claude-tighten`,
        fileId: id,
        fileName: name,
        title: "Tighten prose — cut filler sentences",
        detail:
          "Instructions don't need persuasion. Delete throat-clearing, repeated warnings and 'as an AI' style hedging. Realistic saving: ~15%.",
        saveTokens: Math.round(tokens * 0.15),
        severity: severityFor(tokens * 0.15),
      });
    }
  }

  if (kind === "skill") {
    if (tokens > 5000) {
      out.push({
        id: `${id}:skill-split`,
        fileId: id,
        fileName: name,
        title: "This skill is too big to load whole",
        detail:
          "SKILL.md loads entirely into context when the skill triggers. Split reference catalogs into companion files the skill can read progressively. Realistic saving: ~40%.",
        saveTokens: Math.round(tokens * 0.4),
        severity: "high",
      });
    } else if (tokens > 1800) {
      out.push({
        id: `${id}:skill-trim`,
        fileId: id,
        fileName: name,
        title: "Condense the skill body",
        detail:
          "Keep the trigger description and core procedure; move long example galleries and edge-case lists to referenced files. Realistic saving: ~25%.",
        saveTokens: Math.round(tokens * 0.25),
        severity: severityFor(tokens * 0.25),
      });
    }
  }

  if (kind === "mcp") {
    const servers = mcpServerCount(text);
    if (servers > 6) {
      out.push({
        id: `${id}:mcp-servers`,
        fileId: id,
        fileName: name,
        title: `Audit these ${servers} MCP servers`,
        detail:
          "Every configured server advertises its tools into context. Disable servers you rarely use, or scope each to minimal tool groups. Realistic saving: ~30%.",
        saveTokens: Math.round(tokens * 0.3),
        severity: severityFor(tokens * 0.3),
      });
    } else if (servers > 0) {
      out.push({
        id: `${id}:mcp-desc`,
        fileId: id,
        fileName: name,
        title: "Shorten MCP server descriptions",
        detail:
          "Verbose server descriptions are re-read on every tool call. One crisp sentence per server is enough. Realistic saving: ~15%.",
        saveTokens: Math.round(tokens * 0.15),
        severity: severityFor(tokens * 0.15),
      });
    }
    const minSave = minifiedJsonSavings(text);
    if (minSave > 40) {
      out.push({
        id: `${id}:json-minify`,
        fileId: id,
        fileName: name,
        title: "Minify JSON whitespace",
        detail:
          "Pretty-printed JSON spends tokens on indentation. Minify machine-read configs.",
        saveTokens: minSave,
        severity: "low",
      });
    }
  }

  if (kind === "json") {
    const minSave = minifiedJsonSavings(text);
    if (minSave > 40) {
      out.push({
        id: `${id}:json-minify`,
        fileId: id,
        fileName: name,
        title: "Minify JSON whitespace",
        detail: "Pretty-printed JSON spends tokens on indentation.",
        saveTokens: minSave,
        severity: "low",
      });
    }
  }

  // Long fenced code blocks in markdown-ish files
  if (kind === "claude" || kind === "skill" || kind === "doc") {
    const cb = codeBlockTokens(text);
    if (cb > 400 && cb > tokens * 0.2) {
      out.push({
        id: `${id}:codeblocks`,
        fileId: id,
        fileName: name,
        title: "Move long code examples out of the markdown",
        detail:
          "Fenced code blocks are token-dense. Keep one illustrative example inline; move the rest to referenced files. Realistic saving: ~45% of code-block tokens.",
        saveTokens: Math.round(cb * 0.45),
        severity: severityFor(cb * 0.45),
      });
    }
  }

  return out.map((s) => ({ ...s, saveTokens: Math.min(s.saveTokens, tokens) }));
}

/** Finds near-duplicate boilerplate lines shared across files. */
function buildDuplicationSuggestion(files: FileEntry[]): Suggestion[] {
  const lineMap = new Map<string, { tokens: number; files: Set<string> }>();
  for (const f of files) {
    const seen = new Set<string>();
    for (const rawLine of f.text.split("\n")) {
      const line = rawLine.trim();
      if (line.length < 80) continue;
      if (seen.has(line)) continue;
      seen.add(line);
      const entry = lineMap.get(line);
      if (entry) {
        entry.files.add(f.id);
      } else {
        lineMap.set(line, { tokens: countTokens(line), files: new Set([f.id]) });
      }
    }
  }
  let save = 0;
  let dupLines = 0;
  for (const { tokens, files: ids } of lineMap.values()) {
    if (ids.size >= 2) {
      save += tokens * (ids.size - 1);
      dupLines += 1;
    }
  }
  if (save < 200 || dupLines === 0) return [];
  return [
    {
      id: "all:dedup",
      fileId: "all",
      fileName: `${files.length} files`,
      title: `Deduplicate ${dupLines} repeated boilerplate lines`,
      detail:
        "Identical sentences appear in multiple files — each copy costs tokens every session. Extract shared boilerplate into one referenced doc.",
      saveTokens: Math.round(save),
      severity: severityFor(save),
    },
  ];
}

export function buildSuggestions(files: FileEntry[]): Suggestion[] {
  const perFile = files.flatMap(buildFileSuggestions);
  const cross = files.length > 1 ? buildDuplicationSuggestion(files) : [];
  return [...perFile, ...cross].sort((a, b) => b.saveTokens - a.saveTokens);
}
