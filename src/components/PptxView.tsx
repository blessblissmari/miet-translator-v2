/**
 * PptxView — show a .pptx by converting it to PDF and rendering with pdf.js.
 *
 * The conversion is server-side (LibreOffice headless). The endpoint URL
 * comes from `VITE_CONVERT_TO_PDF_URL` — if absent we show a placeholder
 * with a note.
 *
 * This is the "pptx как pdf" route per the rework spec.
 */

import { useEffect, useRef, useState } from "react";
import { PdfPreview } from "./Preview";

const CONVERT_URL =
  (import.meta.env?.VITE_CONVERT_TO_PDF_URL as string | undefined) ?? "";

export function PptxView({ blob, fileName }: { blob: Blob; fileName?: string }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; pdf: Blob }
    | { kind: "missing-endpoint" }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    setState({ kind: "loading" });
    if (!CONVERT_URL) {
      setState({ kind: "missing-endpoint" });
      return;
    }
    (async () => {
      const form = new FormData();
      form.append("file", blob, fileName ?? "input.pptx");
      const res = await fetch(CONVERT_URL, { method: "POST", body: form });
      if (!aliveRef.current) return;
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setState({ kind: "error", message: `HTTP ${res.status}: ${t.slice(0, 200)}` });
        return;
      }
      const pdf = await res.blob();
      if (!aliveRef.current) return;
      setState({ kind: "ok", pdf });
    })().catch((e) => {
      if (!aliveRef.current) return;
      setState({ kind: "error", message: (e as Error).message });
    });
    return () => {
      aliveRef.current = false;
    };
  }, [blob, fileName]);

  if (state.kind === "loading") return <div className="preview-pane">конвертирую PPTX в PDF…</div>;
  if (state.kind === "ok") return <PdfPreview blob={state.pdf} />;
  if (state.kind === "missing-endpoint") {
    return (
      <div className="preview-pane" style={{ padding: 12 }}>
        <strong>PPTX preview недоступен:</strong>
        <p style={{ marginTop: 8 }}>
          Нужно сконфигурировать <code>VITE_CONVERT_TO_PDF_URL</code> — сервис,
          который конвертирует PPTX → PDF через LibreOffice headless. См.
          <code> tools/cli/convert-to-pdf.mjs</code>.
        </p>
      </div>
    );
  }
  return (
    <div className="preview-pane" style={{ padding: 12, color: "#b00" }}>
      Ошибка конвертации: {state.message}
    </div>
  );
}
