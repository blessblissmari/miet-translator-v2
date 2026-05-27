/**
 * Cascade pipeline orchestrator — runs all five passes end-to-end and
 * produces an assembled Russian markdown document, ready for DOCX build.
 *
 *   normalize → render page images (pdf.js) → pass 1..5 → assemble
 */

import { extractPdf } from "../pdfExtract";
import { runPass1Layout } from "./pass1-layout";
import { runPass2Pages } from "./pass2-pages";
import { runPass3Sverka } from "./pass3-sverka";
import { runPass4Translate } from "./pass4-translate";
import { runPass5Watchdog, applyWatchdogPatches } from "./pass5-watchdog";
import type { PipelineState, TranslatedPage } from "./types";

export interface RunOpts {
  apiKey: string;
  pdf: Uint8Array;
  name: string;
  signal?: AbortSignal;
  /** Bumps a UI progress callback. 0..1, plus a label. */
  onProgress?: (frac: number, label: string) => void;
  /** Skip Pass 1 if we already have a layout from another tool. */
  skipLayout?: boolean;
  /** Skip Pass 3 entirely (e.g. all-scan documents). */
  skipSverka?: boolean;
}

export interface RunResult extends PipelineState {
  /** Final assembled Russian markdown ready for docx build. */
  finalMarkdown: string;
}

export async function runPipeline(opts: RunOpts): Promise<RunResult> {
  const { apiKey, pdf, name, signal, onProgress } = opts;
  const tick = (f: number, l: string) => onProgress?.(f, l);

  tick(0.02, "извлечение страниц (pdf.js)");
  const pdfFile = new File([pdf as BlobPart], name, { type: "application/pdf" });
  const extracted = await extractPdf(pdfFile);
  const pageImages = extracted.pages.map((p) => p.imageDataUrl);
  const pdfjsText = extracted.pages.map((p) => p.text ?? "");

  const state: PipelineState = {
    name,
    pdf,
    pageImages,
    pdfjsText,
  };

  // -- Pass 1 ---------------------------------------------------------------
  if (!opts.skipLayout) {
    tick(0.1, "pass 1 · глобальная layout-карта (mimo-v2.5)");
    try {
      state.layout = await runPass1Layout(apiKey, pageImages, signal);
    } catch (e) {
      console.warn("pass1 failed, continuing without layout map:", e);
    }
  }

  // -- Pass 2 ---------------------------------------------------------------
  tick(0.25, "pass 2 · постраничный OCR (mimo-v2-omni)");
  state.ocr = await runPass2Pages(apiKey, pageImages, state.layout, signal);

  // -- Pass 3 (optional) ----------------------------------------------------
  if (!opts.skipSverka) {
    tick(0.55, "pass 3 · сверка с pdf.js (mimo-v2-flash)");
    try {
      state.sverka = await runPass3Sverka(apiKey, state.ocr, pdfjsText, signal);
    } catch (e) {
      console.warn("pass3 failed, continuing without sverka:", e);
    }
  }

  // -- Pass 4 ---------------------------------------------------------------
  tick(0.7, "pass 4 · академический перевод (mimo-v2.5-pro)");
  state.translated = await runPass4Translate(
    apiKey,
    state.ocr,
    state.sverka,
    signal,
  );

  // Assemble all pages into a single markdown string with page separators.
  let assembled = assemble(state.translated);

  // -- Pass 5 ---------------------------------------------------------------
  tick(0.92, "pass 5 · watchdog (mimo-v2-flash)");
  try {
    state.watchdog = await runPass5Watchdog(apiKey, assembled, signal);
    assembled = applyWatchdogPatches(assembled, state.watchdog);
  } catch (e) {
    console.warn("pass5 watchdog skipped:", e);
  }

  tick(1, "готово");
  return { ...state, finalMarkdown: assembled };
}

function assemble(pages: TranslatedPage[]): string {
  return pages
    .sort((a, b) => a.idx - b.idx)
    .map((p) => `<!-- page ${p.idx} -->\n\n${p.ruMarkdown.trim()}`)
    .join("\n\n");
}
