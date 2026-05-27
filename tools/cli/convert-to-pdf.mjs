#!/usr/bin/env node
/**
 * convert-to-pdf.mjs — DOCX / PPTX → PDF via LibreOffice headless.
 *
 * Two modes:
 *
 *   CLI:    node convert-to-pdf.mjs input.docx [output.pdf]
 *
 *   HTTP:   node convert-to-pdf.mjs --serve --port 7700
 *           POST /  multipart/form-data  "file" → application/pdf
 *
 * The HTTP mode is what the web app calls via VITE_CONVERT_TO_PDF_URL.
 *
 * Requires: libreoffice (apt install libreoffice). Tested with LO 7.x / 24.x.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename, extname } from "node:path";
import http from "node:http";

const LO_BIN = process.env.LIBREOFFICE_BIN || "libreoffice";

async function convertBuffer(inputBuf, originalName = "input.docx") {
  const dir = await mkdtemp(join(tmpdir(), "to-pdf-"));
  try {
    const inPath = join(dir, originalName);
    await writeFile(inPath, inputBuf);
    await new Promise((resolve, reject) => {
      const p = spawn(
        LO_BIN,
        ["--headless", "--nologo", "--nofirststartwizard", "--convert-to", "pdf", "--outdir", dir, inPath],
        { stdio: ["ignore", "inherit", "inherit"] },
      );
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`libreoffice exit ${code}`))));
    });
    const stem = basename(originalName, extname(originalName));
    const outPath = join(dir, `${stem}.pdf`);
    const pdf = await readFile(outPath);
    return pdf;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runCli(args) {
  const inPath = args[0];
  if (!inPath) {
    console.error("usage: convert-to-pdf.mjs input.docx [output.pdf]");
    process.exit(2);
  }
  const buf = await readFile(inPath);
  const pdf = await convertBuffer(buf, basename(inPath));
  const outPath = args[1] || inPath.replace(/\.(docx|pptx)$/i, ".pdf");
  await writeFile(outPath, pdf);
  console.error(`wrote ${outPath} (${pdf.length} bytes)`);
}

function runServer(port) {
  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { "access-control-allow-origin": "*" });
      res.end("POST only");
      return;
    }
    // Minimal multipart parser: pull the entire body, find file part.
    try {
      const ct = req.headers["content-type"] || "";
      const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct);
      if (!m) throw new Error("no multipart boundary");
      const boundary = `--${m[1] || m[2]}`;
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const parts = splitMultipart(body, boundary);
      const filePart = parts.find((p) => /name="file"/.test(p.headers));
      if (!filePart) throw new Error("missing 'file' field");
      const nameMatch = /filename="([^"]+)"/.exec(filePart.headers);
      const name = nameMatch ? nameMatch[1] : "input.docx";
      const pdf = await convertBuffer(filePart.body, name);
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": pdf.length,
        "access-control-allow-origin": "*",
      });
      res.end(pdf);
    } catch (e) {
      res.writeHead(500, {
        "content-type": "text/plain",
        "access-control-allow-origin": "*",
      });
      res.end(`error: ${e.message}`);
    }
  });
  server.listen(port, () => console.error(`convert-to-pdf listening on :${port}`));
}

function splitMultipart(body, boundary) {
  const out = [];
  const bbuf = Buffer.from(boundary);
  let start = 0;
  while (true) {
    const idx = body.indexOf(bbuf, start);
    if (idx < 0) break;
    const next = body.indexOf(bbuf, idx + bbuf.length);
    if (next < 0) break;
    let segStart = idx + bbuf.length;
    if (body[segStart] === 0x0d) segStart += 2; // \r\n after boundary
    let segEnd = next;
    if (body[segEnd - 2] === 0x0d) segEnd -= 2; // strip trailing \r\n
    const seg = body.slice(segStart, segEnd);
    const hdrEnd = seg.indexOf("\r\n\r\n");
    if (hdrEnd < 0) {
      start = next;
      continue;
    }
    out.push({
      headers: seg.slice(0, hdrEnd).toString("utf8"),
      body: seg.slice(hdrEnd + 4),
    });
    start = next;
  }
  return out;
}

const argv = process.argv.slice(2);
if (argv.includes("--serve")) {
  const portArg = argv[argv.indexOf("--port") + 1];
  const port = Number(portArg) || Number(process.env.PORT) || 7700;
  runServer(port);
} else {
  runCli(argv).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
