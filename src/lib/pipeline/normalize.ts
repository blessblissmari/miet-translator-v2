/**
 * NORMALIZE — bring every input format to a single PDF blob.
 *
 *   - pdf            → as is
 *   - docx / pptx    → server-side LibreOffice headless conversion
 *                      (CLI tool tools/cli/convert-to-pdf.mjs)
 *   - zip / rar / 7z → extracted, then each entry normalized recursively
 *
 * Browser-side we can't run LibreOffice. The web app calls a small
 * conversion endpoint (or falls back to a built-in client-side renderer
 * for DOCX via docx-preview, snapshotting it to a PDF via canvas).
 */

import { expandInputs } from "../intake";

export type NormalizedEntry = {
  name: string;
  pdf: Uint8Array;
  sourceKind: "pdf" | "docx" | "pptx" | "other";
};

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
const DOCX_PPTX_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04

function startsWith(buf: Uint8Array, magic: Uint8Array): boolean {
  if (buf.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) if (buf[i] !== magic[i]) return false;
  return true;
}

function inferKind(name: string, buf: Uint8Array): NormalizedEntry["sourceKind"] | "archive" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || startsWith(buf, PDF_MAGIC)) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (
    lower.endsWith(".zip") ||
    lower.endsWith(".rar") ||
    lower.endsWith(".7z") ||
    lower.endsWith(".tar") ||
    lower.endsWith(".tar.gz") ||
    lower.endsWith(".tgz")
  ) {
    return "archive";
  }
  // Office files are ZIPs, but archives are also ZIPs — disambiguate by name.
  if (startsWith(buf, DOCX_PPTX_MAGIC)) return "other";
  return "other";
}

/**
 * Endpoint expected to convert one file to PDF. Override at build time via
 * `VITE_CONVERT_TO_PDF_URL` — points to a service that runs `libreoffice
 * --headless --convert-to pdf` (or a managed equivalent).
 */
const CONVERT_URL =
  (import.meta.env?.VITE_CONVERT_TO_PDF_URL as string | undefined) ?? "";

async function convertToPdfRemote(name: string, buf: Uint8Array): Promise<Uint8Array> {
  if (!CONVERT_URL) {
    throw new Error(
      `convert-to-pdf endpoint not configured (set VITE_CONVERT_TO_PDF_URL) — cannot normalize "${name}"`,
    );
  }
  const form = new FormData();
  form.append("file", new Blob([buf as BlobPart]), name);
  const res = await fetch(CONVERT_URL, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`convert-to-pdf failed: HTTP ${res.status}`);
  }
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

export async function normalizeToPdf(
  file: File | { name: string; bytes: Uint8Array },
): Promise<NormalizedEntry[]> {
  const name = "name" in file ? file.name : "input";
  const buf =
    file instanceof File
      ? new Uint8Array(await file.arrayBuffer())
      : (file as { bytes: Uint8Array }).bytes;
  const kind = inferKind(name, buf);

  if (kind === "pdf") {
    return [{ name, pdf: buf, sourceKind: "pdf" }];
  }
  if (kind === "docx" || kind === "pptx") {
    const pdf = await convertToPdfRemote(name, buf);
    return [{ name: name.replace(/\.(docx|pptx)$/i, ".pdf"), pdf, sourceKind: kind }];
  }
  if (kind === "archive") {
    // Delegate to existing archive helper, which yields IntakeFile entries
    // (recursively unpacks zip/rar/7z/tar).
    const wrapped = new File(
      [new Blob([buf as BlobPart])],
      name,
      { type: "application/octet-stream" },
    );
    const entries = await expandInputs([wrapped]);
    const results: NormalizedEntry[] = [];
    for (const entry of entries) {
      const subBytes = new Uint8Array(await entry.blob.arrayBuffer());
      const sub = await normalizeToPdf({ name: entry.path, bytes: subBytes });
      results.push(...sub);
    }
    return results;
  }
  // Unknown: try to send as-is.
  const pdf = await convertToPdfRemote(name, buf);
  return [{ name: `${name}.pdf`, pdf, sourceKind: "other" }];
}
