/**
 * DocxView — render a .docx Blob in the browser as closely as Word would.
 *
 * Uses `docx-preview`, which parses the OOXML and renders it as HTML
 * with full styling: page layout, fonts, tables, images, math (OMML).
 *
 * Beats `mammoth` (which strips formatting) and beats canvas snapshots.
 */

import { useEffect, useRef } from "react";

export interface DocxViewProps {
  blob: Blob;
  /** Optional CSS class for the outer wrapper. */
  className?: string;
}

export function DocxView({ blob, className }: DocxViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!containerRef.current) return;
      const { renderAsync } = await import("docx-preview");
      // Reset container before render.
      containerRef.current.innerHTML = "";
      if (cancelled) return;
      await renderAsync(blob, containerRef.current, undefined, {
        className: "docx-preview",
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        experimental: true,
        trimXmlDeclaration: true,
        useBase64URL: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
      });
    })().catch((err) => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = `<pre style="color:#b00;padding:12px">docx-preview failed: ${String(err)}</pre>`;
    });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  return <div ref={containerRef} className={className ?? "docx-view-pane"} />;
}
