// Downloads every static asset used by https://jalangmbb.tanwanjern.com into public/.
// Usage: node scripts/download-assets.mjs
// Reads scripts/asset-urls.txt (one root-relative path per line), then follows
// media referenced inside the tenant story JSON files.
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";

const BASE = "https://jalangmbb.tanwanjern.com";
const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC = join(ROOT, "public");
const CONCURRENCY = 4;

const extra = [
  ["/icon.png", "seo/icon.png"],
  ["/apple-icon.png", "seo/apple-icon.png"],
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function download(urlPath, localRel = urlPath.replace(/^\//, "")) {
  const dest = join(PUBLIC, localRel);
  if (await exists(dest)) return { urlPath, status: "skipped" };
  const res = await fetch(BASE + urlPath);
  if (!res.ok) return { urlPath, status: `HTTP ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return { urlPath, status: "ok", bytes: buf.length };
}

async function runBatched(jobs) {
  const results = [];
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY).map((job) =>
      job().catch((error) => ({ status: `error ${error.message}` })),
    );
    results.push(...(await Promise.all(batch)));
  }
  return results;
}

const listed = (await readFile(join(ROOT, "scripts/asset-urls.txt"), "utf8"))
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const first = await runBatched([
  ...listed.map((path) => () => download(path)),
  ...extra.map(([path, local]) => () => download(path, local)),
]);

// Tenant stories reference their own media files.
const storyMedia = new Set();
for (const path of listed.filter((p) => p.startsWith("/stories/tenants/"))) {
  const file = join(PUBLIC, path);
  if (!(await exists(file))) continue;
  const text = await readFile(file, "utf8");
  for (const match of text.matchAll(/"\/stories\/media\/[^"]+"/g)) {
    storyMedia.add(JSON.parse(match[0]));
  }
}
const second = await runBatched([...storyMedia].map((path) => () => download(path)));

const all = [...first, ...second];
const count = (status) => all.filter((r) => r.status === status).length;
const bytes = all.reduce((sum, r) => sum + (r.bytes ?? 0), 0);
console.log(
  `ok ${count("ok")}, skipped ${count("skipped")}, failed ${all.length - count("ok") - count("skipped")}, ${(bytes / 1048576).toFixed(1)} MB`,
);
for (const r of all.filter((r) => r.status !== "ok" && r.status !== "skipped")) {
  console.log("FAILED", r.urlPath, r.status);
}
