/**
 * Pass 5 — FINAL WATCHDOG VERIFIER.
 *
 * Cheap final QA pass over the assembled Russian translation. We feed the
 * full ru-markdown plus the original pdf.js text to the CHEAP tier
 * (mimo-v2-flash) and ask it to detect leftover defects:
 *
 *   - raw LaTeX in prose (not wrapped in $)
 *   - CJK characters that slipped through
 *   - missing figure captions / orphan placeholders
 *   - untranslated technical terms (no glossary substitution)
 *   - obviously incorrect formula transcriptions
 *
 * Returns a list of small text patches we apply locally, plus warnings
 * for things that need a human eye.
 */

import { chat, parseJsonLoose } from "../mimo";
import { modelFor } from "./tiers";
import type { WatchdogReport } from "./types";

const PROMPT = (ru: string) => `You are a final QA checker for a Russian academic translation.

Find leftover defects and propose tiny text patches.

Defect categories:
  1. "raw_latex"   — LaTeX command outside $...$ (e.g. \\mathcal in prose).
  2. "cjk"         — Chinese/Japanese/Korean character anywhere.
  3. "orphan_fig"  — {{FIGURE:n}} placeholder referenced but never closed; or caption missing.
  4. "untranslated" — English technical term where a Russian equivalent exists.
  5. "bad_formula" — clearly broken formula transcription.

Output STRICT JSON ONLY:
{
  "patches": [ { "kind": "<category>", "before": "<exact substring>", "after": "<replacement>" } ],
  "warnings": [ "<human-readable concern that needs review>" ]
}

Rules:
- Patches must be SAFE literal replacements (the "before" must appear EXACTLY ONCE).
- Don't rewrite the document — minimum surgical changes only.
- If nothing to fix, return { "patches": [], "warnings": [] }.

[RU_MARKDOWN]
${ru.slice(0, 60_000)}
[/RU_MARKDOWN]`;

export async function runPass5Watchdog(
  apiKey: string,
  ruMarkdown: string,
  signal?: AbortSignal,
): Promise<WatchdogReport> {
  try {
    const raw = await chat({
      apiKey,
      model: modelFor("CHEAP"),
      messages: [{ role: "user", content: PROMPT(ruMarkdown) }],
      maxTokens: 4000,
      temperature: 0.05,
      signal,
      responseJson: true,
    });
    const parsed = parseJsonLoose<{
      patches?: Array<{ kind: string; before: string; after: string }>;
      warnings?: string[];
    }>(raw);
    return {
      patches: parsed.patches ?? [],
      warnings: parsed.warnings ?? [],
    };
  } catch {
    // Watchdog is advisory — never block.
    return { patches: [], warnings: ["watchdog: skipped (network/model)"] };
  }
}

/** Apply the patches to a markdown string (in-order, literal replace). */
export function applyWatchdogPatches(md: string, report: WatchdogReport): string {
  let out = md;
  for (const p of report.patches) {
    if (!p.before || !out.includes(p.before)) continue;
    // Only apply if the substring appears exactly once (safety).
    const first = out.indexOf(p.before);
    const last = out.lastIndexOf(p.before);
    if (first !== last) continue;
    out = out.replace(p.before, p.after);
  }
  return out;
}
