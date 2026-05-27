/**
 * Pass 4 — ACADEMIC TRANSLATION (English → Russian, МИЭТ-style).
 *
 * Input: per-page OCR markdown from Pass 2, optionally patched with Pass 3
 * sverka suggestions (missing lines re-inserted, formula fixes applied).
 *
 * Output: high-quality Russian academic markdown, keeping math in $...$
 * and figure placeholders intact for later substitution.
 *
 * Uses REASON tier (mimo-v2.5-pro, 1M ctx) — strong on coherent multi-page
 * translations and formula reasoning.
 */

import { chat } from "../mimo";
import { mapWithConcurrency } from "../concurrency";
import { dspGlossaryPrompt } from "../glossary";
import { modelFor } from "./tiers";
import type { PageOCR, SverkaPatch, TranslatedPage } from "./types";

const TARGET_LANG = "русский";

const SYSTEM = `Ты — старший технический переводчик академической литературы для российских технических вузов (МИЭТ-стиль).

Задача: перевести страницу с английского на ${TARGET_LANG}. Регистр — формальный, академический.

ЖЁСТКИЕ ПРАВИЛА:
- ВСЕ формулы оборачиваются в $...$ (inline) или $$...$$ (block). Никакого голого LaTeX в прозе.
- ПЛЕЙСХОЛДЕРЫ {{FIGURE:id}}, {{TABLE:id}}, {{CHART:id}} сохраняются на тех же местах — НЕ переводи и НЕ удаляй их.
- Заголовки рисунков переводи («Рис. 1.2 — структурная схема»).
- НЕ используй китайские/японские/корейские иероглифы (никаких 记忆, 系统, 输入, 输出). Если не знаешь русский эквивалент — оставь английский.
- Имена собственные, единицы измерения, идентификаторы кода, MOSFET/IIR/FIR и т.п. — НЕ переводи.
- Используй официальную русскую терминологию: «частота среза», «импульсная характеристика», «передаточная функция», «без памяти», «линейный инвариантный».
- НЕ выдавай HTML. НЕ добавляй пояснений «вот перевод:». Только сам перевод в markdown.
- Сохраняй структуру: # заголовки, списки, таблицы pipe-формы, code blocks.`;

function applyPatches(ocr: PageOCR, patch?: SverkaPatch): string {
  let md = ocr.markdown;
  if (!patch || patch.scanned) return md;
  // Apply formula fixes literally.
  for (const fix of patch.formulaFixes ?? []) {
    if (fix.wrong && fix.right && md.includes(fix.wrong)) {
      md = md.split(fix.wrong).join(fix.right);
    }
  }
  // Append missing lines as a "sverka append" block — Pass 4 will fold them in.
  if (patch.missing?.length) {
    md += `\n\n<!-- SVERKA_MISSING:\n${patch.missing.join("\n")}\n-->\n`;
  }
  return md;
}

export async function runPass4Translate(
  apiKey: string,
  ocrPages: PageOCR[],
  sverka: SverkaPatch[] | undefined,
  signal?: AbortSignal,
  concurrency = 3,
): Promise<TranslatedPage[]> {
  const glossary = dspGlossaryPrompt();
  const settled = await mapWithConcurrency(
    ocrPages,
    concurrency,
    async (page): Promise<TranslatedPage> => {
      const patch = sverka?.find((s) => s.idx === page.idx);
      const patched = applyPatches(page, patch);
      const ruMarkdown = await chat({
        apiKey,
        model: modelFor("REASON"),
        messages: [
          { role: "system", content: `${SYSTEM}\n\n${glossary}` },
          {
            role: "user",
            content: `Страница ${page.idx}. Переведи на ${TARGET_LANG}:\n\n${patched}`,
          },
        ],
        maxTokens: 12_000,
        temperature: 0.2,
        signal,
      });
      return { idx: page.idx, ruMarkdown: stripPreface(ruMarkdown) };
    },
    { signal },
  );
  return settled.map((r, i) =>
    r.ok
      ? r.value
      : {
          idx: ocrPages[i]?.idx ?? i + 1,
          ruMarkdown: `<!-- translate-failed: ${r.error.message} -->\n\n${ocrPages[i]?.markdown ?? ""}`,
        },
  );
}

function stripPreface(s: string): string {
  // Defensive: drop occasional "Вот перевод:" or markdown fences.
  let out = s.trim();
  out = out.replace(/^(?:```(?:md|markdown)?\s*)/i, "").replace(/```\s*$/i, "");
  out = out.replace(/^(вот\s+перевод[^:\n]*:?\s*)/i, "");
  return out.trim();
}
