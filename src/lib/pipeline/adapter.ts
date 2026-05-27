/**
 * Adapter — convert TranslatedPage[] (cascade pipeline output) into the
 * SlidePlan[] / DocPlan shapes that the existing buildPptx / buildDocx
 * builders consume. This is what lets the v2 cascade plug into the v1
 * MIET-template-based output stage without rewriting the builders.
 */

import type { SlidePlan, DocPlan, DocBlock, ExtractedPage } from "../types";
import type { TranslatedPage } from "./types";

/** Heuristic: split a translated page into a slide title + bullets. */
export function translatedToSlides(
  pages: TranslatedPage[],
  extracted: ExtractedPage[],
): SlidePlan[] {
  return pages.map((p, i) => {
    const lines = (p.ruMarkdown || "").split("\n").map((s: string) => s.trim()).filter(Boolean);

    // First H1/H2 or first short line is the title.
    let title = "";
    let bodyLines: string[] = [];
    if (lines.length) {
      const head = lines[0]!.replace(/^#+\s*/, "");
      if (head.length <= 120) {
        title = head;
        bodyLines = lines.slice(1);
      } else {
        title = `Слайд ${p.idx}`;
        bodyLines = lines;
      }
    } else {
      title = `Слайд ${p.idx}`;
    }

    // Drop markdown bullet markers and figure placeholders.
    const bullets = bodyLines
      .map(l => l.replace(/^[-*•]\s*/, "").replace(/\{\{(FIGURE|TABLE|CHART):[^}]+\}\}/g, "").trim())
      .filter(Boolean)
      .slice(0, 8);

    const src = extracted[i];
    return {
      title,
      bullets,
      imageDataUrl: src?.imageDataUrl,
      // Use image-on-right when the source page is figure/chart-heavy.
      layout:
        bullets.length === 0
          ? "title-image"
          : (src?.images?.length ?? 0) > 0
          ? "title-text-image-right"
          : "title-text",
    } satisfies SlidePlan;
  });
}

/** Convert TranslatedPage[] into a single concatenated DocPlan. */
export function translatedToDoc(
  pages: TranslatedPage[],
  extracted: ExtractedPage[],
  title?: string,
): DocPlan {
  const blocks: DocBlock[] = [];
  pages.forEach((p, i) => {
    const md = p.ruMarkdown || "";
    const lines = md.split("\n");
    let listBuf: string[] = [];
    const flushList = () => {
      if (listBuf.length) {
        blocks.push({ type: "list", ordered: false, items: listBuf });
        listBuf = [];
      }
    };

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) {
        flushList();
        continue;
      }

      // Figure placeholder → emit the corresponding embedded image.
      const figMatch = line.match(/^\{\{FIGURE:(\d+)\}\}\s*(.*)$/);
      if (figMatch) {
        flushList();
        const fIdx = Number(figMatch[1]);
        const img = extracted[i]?.images?.[fIdx]?.dataUrl;
        if (img) blocks.push({ type: "figure", imageDataUrl: img, caption: figMatch[2] || undefined });
        continue;
      }

      // Headings.
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        flushList();
        const level = h[1].length;
        blocks.push({ type: level === 1 ? "h1" : level === 2 ? "h2" : "h3", text: h[2] });
        continue;
      }

      // Block formula.
      const blockMath = line.match(/^\$\$(.+)\$\$$/);
      if (blockMath) {
        flushList();
        blocks.push({ type: "formula", latex: blockMath[1], display: true });
        continue;
      }

      // List item.
      const li = line.match(/^[-*•]\s+(.+)$/);
      if (li) {
        listBuf.push(li[1]);
        continue;
      }

      flushList();
      blocks.push({ type: "para", text: line.trim() });
    }
    flushList();
  });

  return { title, blocks };
}
