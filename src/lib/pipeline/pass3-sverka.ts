/**
 * Pass 3 — PDFJS TEXT SVERKA.
 *
 * For each page, take (a) the OCR markdown from Pass 2 and (b) the raw
 * text layer extracted by pdf.js. Ask the CHEAP tier (mimo-v2-flash) to
 * produce a small JSON patch:
 *   - missing[]: lines pdf.js had that OCR dropped
 *   - hallucinated[]: lines OCR has that pdf.js doesn't support
 *   - formulaFixes[]: { wrong, right } pairs for mis-recognized formulas
 *
 * If the pdf.js text is empty (scanned page) we skip cheaply and mark
 * `scanned: true` so Pass 4 knows to trust Pass 2.
 */

import { chat, parseJsonLoose } from "../mimo";
import { mapWithConcurrency } from "../concurrency";
import { modelFor } from "./tiers";
import type { PageOCR, SverkaPatch } from "./types";

const PROMPT = (ocr: string, pdfjs: string) => `You are comparing two extractions of the SAME page:

[OCR_MARKDOWN]
${ocr}
[/OCR_MARKDOWN]

[PDFJS_TEXT_LAYER]
${pdfjs}
[/PDFJS_TEXT_LAYER]

Produce STRICT JSON ONLY:
{
  "missing": [ "<line OCR dropped, present in pdf.js>", ... ],
  "hallucinated": [ "<line OCR invented, absent from pdf.js>", ... ],
  "formulaFixes": [ { "wrong": "<as-in-OCR>", "right": "<correct LaTeX>" }, ... ]
}

Rules:
- Be conservative. Only flag CLEAR discrepancies.
- Whitespace, line-wrapping, and reading-order differences are NOT discrepancies.
- For formulas, fixes should be LaTeX, wrapped in $...$.
- Return [] for any empty category. No prose.`;

export async function runPass3Sverka(
  apiKey: string,
  ocrPages: PageOCR[],
  pdfjsText: string[],
  signal?: AbortSignal,
  concurrency = 6,
): Promise<SverkaPatch[]> {
  const settled = await mapWithConcurrency(
    ocrPages,
    concurrency,
    async (page): Promise<SverkaPatch> => {
      const idx = page.idx;
      const pdfjs = pdfjsText[idx - 1] ?? "";
      if (!pdfjs.trim() || pdfjs.trim().length < 20) {
        return { idx, scanned: true };
      }
      try {
        const raw = await chat({
          apiKey,
          model: modelFor("CHEAP"),
          messages: [{ role: "user", content: PROMPT(page.markdown, pdfjs) }],
          maxTokens: 2000,
          temperature: 0.05,
          signal,
          responseJson: true,
        });
        const parsed = parseJsonLoose<{
          missing?: string[];
          hallucinated?: string[];
          formulaFixes?: Array<{ wrong: string; right: string }>;
        }>(raw);
        return {
          idx,
          scanned: false,
          missing: parsed.missing ?? [],
          hallucinated: parsed.hallucinated ?? [],
          formulaFixes: parsed.formulaFixes ?? [],
        };
      } catch {
        return { idx, scanned: false, missing: [], hallucinated: [], formulaFixes: [] };
      }
    },
    { signal },
  );
  return settled.map((r, i) =>
    r.ok ? r.value : { idx: ocrPages[i]?.idx ?? i + 1, scanned: false },
  );
}
