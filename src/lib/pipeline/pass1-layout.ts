/**
 * Pass 1 — GLOBAL OCR + LAYOUT MAP.
 *
 * Sends the entire document (as page images) to the OMNI_BEST tier
 * (mimo-v2.5, 1M ctx) in a single request. Asks the model to produce a
 * coarse layout map describing what's on each page: text, figures,
 * tables, charts, equations.
 *
 * This map drives Pass 2 (we know which pages need figure-extraction
 * effort), Pass 4 (caption-aware translation), and Pass 5 (sanity check).
 */

import { chat, parseJsonLoose } from "../mimo";
import { downsampleDataUrl } from "../imageOps";
import { modelFor } from "./tiers";
import type { LayoutMap } from "./types";

const PROMPT = `You are a document layout analyzer for academic/engineering papers.
You are shown a sequence of PAGE IMAGES of a single document, in order.

Your task: produce a JSON map of the document layout. For each page, identify:
  - kind: "text" | "figure" | "table" | "chart" | "equation" | "mixed"
  - regions[]: bounding boxes (normalized 0..1) of any figure, table, chart, equation
  - hasMath: true if the page contains formulas
  - caption: short (≤ 80 chars) english summary of what's on the page

Output STRICT JSON ONLY, no prose, this exact shape:
{
  "pageCount": <int>,
  "notes": "<short global notes: acronyms, subject area, formula style>",
  "pages": [
    {
      "idx": 1,
      "kind": "text",
      "hasMath": true,
      "caption": "intro to signals and systems",
      "regions": [
        { "kind": "figure", "bbox": [0.1, 0.4, 0.9, 0.7], "caption": "Fig 1.2 block diagram" }
      ]
    }
  ]
}

Do NOT include any reasoning, comments, or text outside the JSON.`;

export async function runPass1Layout(
  apiKey: string,
  pageImages: string[],
  signal?: AbortSignal,
): Promise<LayoutMap> {
  // Downsample images to keep request size sane — Pass 1 is a coarse pass.
  const small = await Promise.all(
    pageImages.map((img) => downsampleDataUrl(img, { maxDim: 900, quality: 0.7 })),
  );

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: PROMPT }];
  small.forEach((url, i) => {
    content.push({ type: "text", text: `--- page ${i + 1} ---` });
    content.push({ type: "image_url", image_url: { url } });
  });

  const raw = await chat({
    apiKey,
    model: modelFor("OMNI_BEST"),
    messages: [{ role: "user", content }],
    maxTokens: 16_000,
    temperature: 0.1,
    signal,
    responseJson: true,
  });

  const map = parseJsonLoose<LayoutMap>(raw);
  if (!map || typeof map.pageCount !== "number" || !Array.isArray(map.pages)) {
    throw new Error("pass1: bad layout JSON");
  }
  return map;
}
