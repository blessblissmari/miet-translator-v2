# MIET Translator Pro · v2 (rework)

Веб-приложение, переводящее английские академические **PDF / DOCX / PPTX**
(а также `zip / rar / 7z` с такими файлами) в качественные русские DOCX/PPTX
в шаблоне МИЭТ.

> **v2 — каскадный конвейер из 5 проходов** с разными моделями MiMo для
> разных задач (vision-omni на тяжёлых, дешёвый flash на сверке/QA).
> Подробности концепции — в [`REWORK.md`](./REWORK.md).
>
> Полный путь миграции: старый `docPlanner` ещё работает как fallback. См.
> [`HANDSOFF.md`](./HANDSOFF.md) для истории до v2.

**Live (v1):** https://blessblissmari.github.io/miet-translator-pro/

---

## Алгоритм v2 (TL;DR)

```
input → normalize (→PDF) → pdf.js render
   │
   ├── Pass 1: GLOBAL OCR + LAYOUT MAP        mimo-v2.5         (omni, 1M)
   ├── Pass 2: PER-PAGE OCR                   mimo-v2-omni      (omni, 256K)
   ├── Pass 3: SVERKA с pdf.js текстом        mimo-v2-flash     (cheap)
   ├── Pass 4: АКАДЕМИЧЕСКИЙ ПЕРЕВОД          mimo-v2.5-pro     (reason)
   └── Pass 5: WATCHDOG (QA-патчи)            mimo-v2-flash     (cheap)
   │
   ▼  собираем русский markdown → DOCX (OMML) / PPTX (шаблон МИЭТ)
```

| Pass | Tier        | Model              | Зачем                                                 |
|------|-------------|--------------------|-------------------------------------------------------|
| 1    | `OMNI_BEST` | `mimo-v2.5`        | один заход — карта layout всего документа (1M ctx)    |
| 2    | `OMNI_MID`  | `mimo-v2-omni`     | постраничный OCR с подсказкой из Pass 1               |
| 3    | `CHEAP`     | `mimo-v2-flash`    | diff OCR ↔ pdf.js (что пропустили, что переврали)     |
| 4    | `REASON`    | `mimo-v2.5-pro`    | финальный перевод с глоссарием МИЭТ + ЦОС             |
| 5    | `CHEAP`     | `mimo-v2-flash`    | патчи: голый LaTeX, CJK, orphan-картинки, англицизмы  |

Тиры — это **роли**. Чтобы переключить модель — правь
[`src/lib/pipeline/tiers.ts`](src/lib/pipeline/tiers.ts).

### Что с рисунками и графиками

- **Растровые рисунки** вырезаются из PDF через `pdfimages` (CLI) /
  pdf.js (web).
- **Векторные графики** (TikZ/PGFPlots/matplotlib) рендерим страничным
  crop'ом по bbox из Pass 1 → PNG на белом фоне.
- **Перерисовка с русскими подписями** — через
  [`tools/cli/redraw-figure.py`](tools/cli/redraw-figure.py)
  (matplotlib, фон белый, dpi=200).

### Что с превью

- **DOCX** — отображается как в Word через библиотеку `docx-preview`
  (см. [`src/components/DocxView.tsx`](src/components/DocxView.tsx)).
- **PPTX** — конвертируется в PDF через LibreOffice headless
  (см. [`tools/cli/convert-to-pdf.mjs`](tools/cli/convert-to-pdf.mjs))
  и показывается через pdf.js
  (см. [`src/components/PptxView.tsx`](src/components/PptxView.tsx)).

---

## Структура кода

```
src/lib/
  mimo.ts               # клиент MiMo: 4 модели, fallback chain, key rotation
  pipeline/
    tiers.ts            # OMNI_BEST / OMNI_MID / REASON / CHEAP → model IDs
    types.ts            # LayoutMap, PageOCR, SverkaPatch, TranslatedPage, ...
    normalize.ts        # docx/pptx/archive → PDF
    pass1-layout.ts     # глобальная layout-карта
    pass2-pages.ts      # постраничный OCR
    pass3-sverka.ts     # сверка с pdf.js
    pass4-translate.ts  # академический перевод
    pass5-watchdog.ts   # финальный QA-патч
    pipeline.ts         # оркестратор всех 5 проходов

src/components/
  DocxView.tsx          # DOCX preview (как в Word)
  PptxView.tsx          # PPTX preview (через PDF)

tools/cli/
  convert-to-pdf.mjs    # LibreOffice headless (DOCX/PPTX → PDF) [CLI + HTTP]
  redraw-figure.py      # matplotlib: график → PNG на белом фоне
```

Старые модули (`docPlanner.ts`, `slidePlanner.ts`, и т.д.) пока остаются —
ими сейчас и крутится App.tsx. Переключение `App.tsx` на новый pipeline —
следующий шаг (см. список ниже).

---

## Запуск конвертера PDF локально

Нужно для DOCX/PPTX → PDF (и для отображения PPTX в браузере).

```bash
apt install -y libreoffice                       # один раз
node tools/cli/convert-to-pdf.mjs --serve --port 7700
```

В Vite (env):

```env
VITE_CONVERT_TO_PDF_URL=http://localhost:7700/
```

Если ENV не выставлена — DOCX/PPTX-вход просто будет отклонён, PDF-вход
работает как обычно.

---

## Локальный запуск (web)

```bash
bun install
bun run dev       # http://localhost:5173
bun run test      # vitest, 82 теста
bun run typecheck # tsc -b
```

---

## Что осталось (v2 work-in-progress)

- [ ] подключить `runPipeline` из `src/lib/pipeline/pipeline.ts` в `App.tsx`
      (сейчас всё ещё крутится старый `docPlanner`)
- [ ] в `OriginalPreview.tsx` / `Preview.tsx` переключиться на `DocxView` /
      `PptxView`
- [ ] e2e-сценарий с реальным PDF и проверкой OMML в выходном DOCX
- [ ] `redraw-figure.py` встроить в pipeline (server-side вызов из Pass 4)
- [ ] провести «глобальный тест» на `~/Documents/Дымань входные данные/`

---

## Стек

- **Frontend:** React 19 + TypeScript + Vite 8 + Tailwind-style плоский CSS
- **Парсинг PDF:** pdf.js (canvas + text layer)
- **Перевод:** Xiaomi MiMo (Singapore endpoint, OpenAI-совместимый)
- **Сборка DOCX:** `docx@9` + кастомный LaTeX→OMML
- **Сборка PPTX:** кастомный builder поверх `src/assets/template.pptx`
- **DOCX preview:** `docx-preview@0.3.x`
- **PPTX preview:** LibreOffice headless → PDF → pdf.js
- **Архивы:** `libarchive.js` (WASM) для rar/7z/tar, `jszip` для zip

---

## Лицензия и контекст

Учебный проект (МИЭТ). Используй как форк-точку для своих задач перевода.
