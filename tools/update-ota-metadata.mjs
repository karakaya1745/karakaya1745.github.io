/**
 * Regenerate root metadata.json from local OTA catalog files.
 * Revision always tracks stream_map.json → _revision (MS Store gate).
 *
 *   node tools/update-ota-metadata.mjs
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REQUIRED = ["channels.json", "stream_map.json"];
const OPTIONAL = ["channel_logos.json"];

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function main() {
  const streamMapPath = path.join(ROOT, "stream_map.json");
  const channelsPath = path.join(ROOT, "channels.json");
  if (!fs.existsSync(streamMapPath) || !fs.existsSync(channelsPath)) {
    throw new Error("channels.json / stream_map.json missing in Pages root");
  }

  const streamMap = JSON.parse(fs.readFileSync(streamMapPath, "utf8"));
  const channels = JSON.parse(fs.readFileSync(channelsPath, "utf8"));
  const revision = Number(streamMap._revision) || 0;
  if (!revision) throw new Error("stream_map.json missing _revision");

  const files = {};
  for (const name of [...REQUIRED, ...OPTIONAL]) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) {
      if (OPTIONAL.includes(name)) continue;
      throw new Error(`Missing ${name}`);
    }
    files[name] = { sha256: sha256File(p) };
  }

  const metadata = {
    revision,
    updatedAt: new Date().toISOString(),
    channelCount: Array.isArray(channels) ? channels.length : 0,
    files,
  };

  const out = path.join(ROOT, "metadata.json");
  fs.writeFileSync(out, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`[ota-metadata] Wrote metadata.json revision=${revision} channels=${metadata.channelCount}`);
  return metadata;
}

main();
