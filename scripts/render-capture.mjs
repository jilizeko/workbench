#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, "docs");
const MEDIA_DIR = path.join(DOCS_DIR, "media");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const [slug, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }

  return { slug, options };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function resolveDocsPath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const relativePath = cleanPath === "/"
    ? "index.html"
    : cleanPath.replace(/^\/+/, "");
  let filePath = path.join(DOCS_DIR, relativePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!path.extname(filePath)) {
    const asDirectory = path.join(filePath, "index.html");
    if (fs.existsSync(asDirectory)) return asDirectory;
    const asHtml = `${filePath}.html`;
    if (fs.existsSync(asHtml)) return asHtml;
  }

  return filePath;
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const filePath = resolveDocsPath(request.url || "/");

      if (!filePath.startsWith(DOCS_DIR)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      if (!fs.existsSync(filePath)) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
      fs.createReadStream(filePath).pipe(response);
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function loadManifest(slug) {
  const manifestPath = path.join(MEDIA_DIR, slug, "candidates", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    fail(`Missing manifest: ${path.relative(ROOT, manifestPath)}. Run prepare first.`);
  }

  return { manifest: readJson(manifestPath), manifestPath };
}

function filterCandidates(candidates, options) {
  let result = candidates;

  if (options.asset) {
    result = result.filter((candidate) => candidate.asset === options.asset);
  }

  if (options.id) {
    result = result.filter((candidate) => candidate.id === options.id);
  }

  if (options.kind) {
    result = result.filter((candidate) => candidate.kind === options.kind);
  }

  if (options.limit) {
    result = result.slice(0, Number(options.limit));
  }

  return result;
}

function executableExists(binaryPath) {
  if (!binaryPath) return false;
  const result = spawnSync(binaryPath, ["-version"], { stdio: "ignore" });
  return result.status === 0;
}

function findPlaywrightFfmpeg() {
  const cacheRoot = path.join(process.env.HOME || "", "Library", "Caches", "ms-playwright");
  if (!fs.existsSync(cacheRoot)) return null;

  const entries = fs.readdirSync(cacheRoot, { withFileTypes: true });
  const ffmpegDir = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("ffmpeg-"))
    .sort((a, b) => b.name.localeCompare(a.name))[0];

  if (!ffmpegDir) return null;

  const candidates = [
    path.join(cacheRoot, ffmpegDir.name, "ffmpeg-mac"),
    path.join(cacheRoot, ffmpegDir.name, "ffmpeg-linux"),
    path.join(cacheRoot, ffmpegDir.name, "ffmpeg.exe"),
  ];

  return candidates.find((candidate) => executableExists(candidate)) || null;
}

function getFfmpegBinary() {
  if (executableExists(process.env.FFMPEG_BINARY)) return process.env.FFMPEG_BINARY;
  if (executableExists("ffmpeg")) return "ffmpeg";
  return findPlaywrightFfmpeg();
}

async function waitForCaptureReady(page) {
  await page.waitForFunction(() => window.__GENART_CAPTURE__?.ready === true, undefined, {
    timeout: 15000,
  });
}

async function getCaptureCanvasHandle(page, candidateId) {
  const explicit = page.locator('canvas[data-capture-target="true"]').last();
  if (await explicit.count()) {
    return explicit.elementHandle();
  }

  const visibleCanvases = page.locator("canvas.art-canvas:visible");
  const visibleCount = await visibleCanvases.count();
  if (visibleCount === 1) {
    return visibleCanvases.first().elementHandle();
  }
  if (visibleCount > 1) {
    return visibleCanvases.last().elementHandle();
  }

  const canvases = page.locator("canvas.art-canvas");
  const count = await canvases.count();
  if (count === 1) {
    return canvases.first().elementHandle();
  }
  if (count > 1) {
    return canvases.last().elementHandle();
  }

  throw new Error(`Canvas not found for ${candidateId}`);
}

async function writeCanvasPng(canvasHandle, outputPath) {
  const dataUrl = await canvasHandle.evaluate((canvas) => canvas.toDataURL("image/png"));
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));
}

async function captureImageCandidate(page, candidate, paths) {
  await page.goto(candidate.captureUrl, { waitUntil: "networkidle" });
  await waitForCaptureReady(page);
  await page.evaluate(async (frameTime) => {
    await window.__GENART_CAPTURE__?.captureStill?.(frameTime ?? 0);
  }, candidate.frameTime ?? 0);

  const canvasHandle = await getCaptureCanvasHandle(page, candidate.id);

  await writeCanvasPng(canvasHandle, paths.outputPath);
  return {
    id: candidate.id,
    asset: candidate.asset,
    kind: candidate.kind,
    output: path.relative(ROOT, paths.outputPath),
  };
}

async function captureVideoCandidate(page, candidate, paths, options) {
  await page.goto(candidate.captureUrl, { waitUntil: "networkidle" });
  await waitForCaptureReady(page);

  const fps = candidate.fps || 30;
  const duration = candidate.duration || 4;
  const totalFrames = Math.max(1, Math.round(fps * duration));
  const canvasHandle = await getCaptureCanvasHandle(page, candidate.id);

  ensureDir(paths.framesDir);

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    const seconds = frameIndex / fps;
    await page.evaluate(async (frameTime) => {
      await window.__GENART_CAPTURE__?.captureStill?.(frameTime);
    }, seconds);
    const framePath = path.join(paths.framesDir, `${String(frameIndex).padStart(4, "0")}.png`);
    await writeCanvasPng(canvasHandle, framePath);
  }

  let encoded = null;
  const ffmpegBinary = getFfmpegBinary();
  if (!options["frames-only"] && ffmpegBinary) {
    const ffmpegArgs = [
      "-y",
      "-framerate",
      String(fps),
      "-i",
      path.join(paths.framesDir, "%04d.png"),
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      paths.outputPath,
    ];
    const result = spawnSync(ffmpegBinary, ffmpegArgs, { stdio: "pipe" });
    if (result.status !== 0) {
      throw new Error(result.stderr.toString("utf8") || `ffmpeg failed for ${candidate.id}`);
    }
    encoded = path.relative(ROOT, paths.outputPath);
  }

  return {
    id: candidate.id,
    asset: candidate.asset,
    kind: candidate.kind,
    frames: path.relative(ROOT, paths.framesDir),
    output: encoded,
  };
}

async function captureSlug(slug, options) {
  const { manifest } = loadManifest(slug);
  const candidates = filterCandidates(manifest.candidates, options);
  if (candidates.length === 0) {
    fail(`No candidates matched for ${slug}`);
  }

  const rendersDir = path.join(MEDIA_DIR, slug, "candidates", "renders");
  const framesRoot = path.join(MEDIA_DIR, slug, "candidates", "frames");
  const reportsDir = path.join(MEDIA_DIR, slug, "candidates", "reports");
  ensureDir(rendersDir);
  ensureDir(reportsDir);

  const { server, baseUrl } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const report = {
    slug,
    capturedAt: new Date().toISOString(),
    baseUrl,
    results: [],
  };

  try {
    for (const candidate of candidates) {
      const outputExtension = candidate.kind === "image" ? "png" : candidate.format;
      const outputPath = path.join(rendersDir, `${candidate.id}.${outputExtension}`);
      const framesDir = path.join(framesRoot, candidate.id);
      const context = await browser.newContext({
        viewport: {
          width: candidate.width,
          height: candidate.height,
        },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      candidate.captureUrl = `${baseUrl}${candidate.captureUrl}`;

      try {
        const result = candidate.kind === "image"
          ? await captureImageCandidate(page, candidate, { outputPath })
          : await captureVideoCandidate(page, candidate, { outputPath, framesDir }, options);
        report.results.push(result);
        console.log(`Captured ${candidate.id}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  const reportPath = path.join(reportsDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeJson(reportPath, report);
  console.log(`Wrote capture report: ${path.relative(ROOT, reportPath)}`);
}

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/render-capture.mjs <slug> [--asset <asset>] [--kind image|video] [--id <candidate-id>] [--limit <n>] [--frames-only]");
}

const { slug, options } = parseArgs(process.argv.slice(2));

if (!slug) {
  printUsage();
  process.exit(0);
}

captureSlug(slug, options).catch((error) => {
  console.error(error);
  process.exit(1);
});
