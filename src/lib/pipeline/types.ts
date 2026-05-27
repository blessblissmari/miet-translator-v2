/**
 * Shared types for the 5-pass cascade pipeline.
 *
 * Each pass consumes the output of previous passes and adds its own slice.
 * The whole bundle is the `PipelineState` that travels through the pipeline.
 */

export type PageKind = "text" | "figure" | "table" | "chart" | "equation" | "mixed";

/** Output of Pass 1 — coarse layout map for the entire document. */
export interface LayoutMap {
  pageCount: number;
  pages: LayoutPage[];
  /** Free-form notes the model wants to remember globally (acronyms, etc.). */
  notes?: string;
}

export interface LayoutPage {
  idx: number; // 1-based
  /** Dominant content kind. */
  kind: PageKind;
  /** Bounding boxes for figures / tables / charts (rough, in 0..1 page coords). */
  regions?: LayoutRegion[];
  /** True if the page likely contains mathematical formulas. */
  hasMath?: boolean;
  caption?: string;
}

export interface LayoutRegion {
  kind: "figure" | "table" | "chart" | "equation";
  /** Normalized bbox: [x0, y0, x1, y1] in 0..1. */
  bbox: [number, number, number, number];
  caption?: string;
  id?: string; // e.g., "fig-2.3"
}

/** Output of Pass 2 — per-page OCR markdown + placeholders. */
export interface PageOCR {
  idx: number;
  /** Markdown with $...$ and $$...$$ math, plus {{FIGURE:id}} placeholders. */
  markdown: string;
  /** Detected language (for sanity logs). */
  lang?: string;
  /** Figures referenced by this page, with their resolved IDs. */
  figureIds?: string[];
}

/** Output of Pass 3 — diff/sverka patch from comparing OCR to pdf.js text. */
export interface SverkaPatch {
  idx: number;
  /** True if pdf.js had no text layer (scanned page). */
  scanned: boolean;
  /** Lines the model suggests OCR missed. */
  missing?: string[];
  /** Lines the model considers hallucinated. */
  hallucinated?: string[];
  /** Formula corrections: { wrong, right } pairs. */
  formulaFixes?: Array<{ wrong: string; right: string }>;
}

/** Output of Pass 4 — final Russian translation per page. */
export interface TranslatedPage {
  idx: number;
  ruMarkdown: string;
}

/** Output of Pass 5 — final watchdog patch applied to assembled doc. */
export interface WatchdogReport {
  /** Patches applied: { kind, before, after }. */
  patches: Array<{ kind: string; before: string; after: string }>;
  /** Remaining concerns flagged but not auto-fixed. */
  warnings: string[];
}

/** The full state bundle that travels through the pipeline. */
export interface PipelineState {
  /** Filename for logging. */
  name: string;
  /** PDF bytes — every other format is normalized to PDF first. */
  pdf: Uint8Array;
  /** Page images as dataURLs (rendered by pdf.js at ~150 DPI). */
  pageImages: string[];
  /** pdf.js text per page (may be empty for scans). */
  pdfjsText: string[];
  /** Pass 1 result. */
  layout?: LayoutMap;
  /** Pass 2 results, one per page. */
  ocr?: PageOCR[];
  /** Pass 3 results, one per page. */
  sverka?: SverkaPatch[];
  /** Pass 4 result. */
  translated?: TranslatedPage[];
  /** Pass 5 result. */
  watchdog?: WatchdogReport;
  /** Extracted figure assets (id → dataURL). */
  figures?: Record<string, string>;
}
