/**
 * Pass 2 — PER-PAGE OCR.
 *
 * For each page, send the high-resolution page image + the layout slice
 * from Pass 1 to OMNI_MID (mimo-v2-omni). Produce markdown with:
 *   - $...$ / $$...$$ for formulas
 *   - {{FIGURE:id}} / {{TABLE:id}} / {{CHART:id}} placeholders at the
 *     positions where figures appeared on the page
 *   - structure preserved (headings, lists, code blocks)
 *
 * Runs with bounded concurrency.
 */

import { chat } from "../mimo";
import { mapWithConcurrency } from "../concurrency";
import { modelFor } from "./tiers";
import type { LayoutMap, LayoutPage, PageOCR } from "./types";

const SYSTEM = `You are an OCR transcriber for academic / engineering papers.
Goal: emit FAITHFUL markdown for the single page image you're given.

Rules:
- Use $...$ (inline) and $$...$$ (block) for ALL math. NEVER leave bare LaTeX.
- Preserve headings (#, ##), lists, code blocks, tables (markdown pipe form).
- Replace each figure / chart / table with a placeholder: {{FIGURE:1}}, {{CHART:1}},
  {{TABLE:1}} in the position it appears in reading order.
- Do NOT translate. Output is the SAME language as the page (likely English).
- Do NOT output HTML. Do NOT output Chinese/Japanese/Korean characters.
- Do NOT add prose, explanations, or "[Page N]" tags. Just the markdown.`;

function userPrompt(layout?: LayoutPage): string {
  if (!layout) return "Transcribe this page as markdown per the rules.";
  const hints: string[] = [`Layout hint: kind=${layout.kind}.`];
  if (layout.hasMath) hints.push("Page contains formulas — wrap them in $...$.");
  if (layout.regions?.length) {
    hints.push(
      `Regions: ${layout.regions
        .map((r, i) => `${r.kind}#${i + 1} (${r.caption ?? "no caption"})`)
        .join("; ")}`,
    );
  }
  return `${hints.join(" ")}\n\nTranscribe this page as markdown per the rules.`;
}

export async function runPass2Pages(
  apiKey: string,
  pageImages: string[],
  layout: LayoutMap | undefined,
  signal?: AbortSignal,
  concurrency = 4,
): Promise<PageOCR[]> {
  const settled = await mapWithConcurrency(
    pageImages,
    concurrency,
    async (img, idx): Promise<PageOCR> => {
      const layoutPage = layout?.pages?.find((p) => p.idx === idx + 1);
      const markdown = await chat({
        apiKey,
        model: modelFor("OMNI_MID"),
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt(layoutPage) },
              { type: "image_url", image_url: { url: img } },
            ],
          },
        ],
        maxTokens: 8000,
        temperature: 0.1,
        signal,
      });
      const figureIds = [...markdown.matchAll(/\{\{FIGURE:([^}]+)\}\}/g)].map(
        (m) => m[1],
      );
      return { idx: idx + 1, markdown, figureIds };
    },
    { signal },
  );
  return settled.map((r, i) =>
    r.ok ? r.value : { idx: i + 1, markdown: `<!-- ocr-failed: ${r.error.message} -->` },
  );
}
