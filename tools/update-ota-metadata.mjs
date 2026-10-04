/**
 * Regenerate root metadata.json from local OTA catalog files.
 * MS Store reads metadata.json `revision` before it will refresh stream_map.
 * That number must always equal stream_map.json `_revision`.
 *
 *   node tools/update-ota-metadata.mjs
 *   node tools/update-ota-metadata.mjs --check
 *
 * Catalog writers call syncOtaMetadataBeside() after writing channels.json
 * or stream_map.json in a Pages root. Push to main also runs
 * .github/workflows/sync-ota-metadata.yml, which commits metadata.json
 * if a publish skipped this step.
 *
 * Already-matching revision, channelCount, and file hashes are left
 * untouched so updatedAt does not churn.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
const REQUIRED = ["channels.json", "stream_map.json"];
const OPTIONAL = ["channel_logos.json"];

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sameFiles(a, b) {
  const left = a || {};
  const right = b || {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key]?.sha256 !== right[key]?.sha256) return false;
  }
  return true;
}

/**
 * @param {string} [root]
 * @param {{ check?: boolean }} [opts]
 * @returns {{ revision: number, channelCount: number, changed: boolean }}
 */
export function syncOtaMetadata(root = ROOT, opts = {}) {
  const check = Boolean(opts.check);
  const streamMapPath = path.join(root, "stream_map.json");
  const channelsPath = path.join(root, "channels.json");
  if (!fs.existsSync(streamMapPath) || !fs.existsSync(channelsPath)) {
    throw new Error("channels.json / stream_map.json missing in Pages root");
  }

  const streamMap = JSON.parse(fs.readFileSync(streamMapPath, "utf8"));
  const channels = JSON.parse(fs.readFileSync(channelsPath, "utf8"));
  const revision = Number(streamMap._revision) || 0;
  if (!revision) throw new Error("stream_map.json missing _revision");

  const files = {};
  for (const name of [...REQUIRED, ...OPTIONAL]) {
    const filePath = path.join(root, name);
    if (!fs.existsSync(filePath)) {
      if (OPTIONAL.includes(name)) continue;
      throw new Error(`Missing ${name}`);
    }
    files[name] = { sha256: sha256File(filePath) };
  }

  const channelCount = Array.isArray(channels) ? channels.length : 0;
  const out = path.join(root, "metadata.json");
  const existing = readJsonIfExists(out);
  const inSync =
    existing &&
    Number(existing.revision) === revision &&
    Number(existing.channelCount) === channelCount &&
    sameFiles(existing.files, files);

  if (inSync) {
    console.log(
      `[ota-metadata] In sync revision=${revision} channels=${channelCount}`,
    );
    return { revision, channelCount, changed: false };
  }

  if (check) {
    const have = existing?.revision ?? "missing";
    console.error(
      `[ota-metadata] OUT OF SYNC metadata.revision=${have} stream_map._revision=${revision}. Run: node tools/update-ota-metadata.mjs`,
    );
    const err = new Error("metadata.json out of sync with stream_map.json");
    err.code = "OTA_METADATA_DRIFT";
    throw err;
  }

  const metadata = {
    ...(existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {}),
    revision,
    updatedAt: new Date().toISOString(),
    channelCount,
    files,
  };

  fs.writeFileSync(out, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(
    `[ota-metadata] Wrote metadata.json revision=${revision} channels=${channelCount}`,
  );
  return { revision, channelCount, changed: true };
}

/**
 * Refresh metadata.json next to a Pages catalog file.
 * No-op unless the directory has both catalog files and is a Pages root
 * (existing metadata.json or .nojekyll). Android asset copies are skipped.
 * @param {string} catalogFile
 */
export function syncOtaMetadataBeside(catalogFile) {
  if (!catalogFile) return null;
  const dir = path.dirname(path.resolve(catalogFile));
  const base = path.basename(catalogFile);
  if (base !== "stream_map.json" && base !== "channels.json") return null;
  if (!fs.existsSync(path.join(dir, "stream_map.json"))) return null;
  if (!fs.existsSync(path.join(dir, "channels.json"))) return null;
  const pagesRoot =
    fs.existsSync(path.join(dir, "metadata.json")) ||
    fs.existsSync(path.join(dir, ".nojekyll"));
  if (!pagesRoot) return null;
  return syncOtaMetadata(dir);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  try {
    syncOtaMetadata(ROOT, { check: process.argv.includes("--check") });
  } catch (err) {
    if (err?.code !== "OTA_METADATA_DRIFT") {
      console.error("[ota-metadata] HATA:", err?.message || err);
    }
    process.exit(1);
  }
}
