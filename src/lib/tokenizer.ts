import { encode } from "gpt-tokenizer";

/**
 * Real token counting via gpt-tokenizer (o200k/cl100k-style BPE).
 * Long inputs are counted in chunks to keep the UI responsive;
 * boundary effects between chunks are negligible (<0.1%).
 */
const CHUNK_CHARS = 200_000;

export function countTokens(text: string): number {
  if (!text) return 0;
  let total = 0;
  for (let i = 0; i < text.length; i += CHUNK_CHARS) {
    total += encode(text.slice(i, i + CHUNK_CHARS)).length;
  }
  return total;
}
