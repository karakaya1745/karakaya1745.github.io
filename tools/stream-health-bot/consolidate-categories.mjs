#!/usr/bin/env node
/**
 * channels.json — hedef kategorilerdeki dağınık kanalları tek blokta birleştirir.
 * Tam kategori sıralaması yapmaz; Ulusal vb. göreli sıra korunur.
 *
 * Usage:
 *   node tools/stream-health-bot/consolidate-categories.mjs
 *   node tools/stream-health-bot/consolidate-categories.mjs --apply
 *   node tools/stream-health-bot/consolidate-categories.mjs --channels path/to/channels.json --apply
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  atomicWriteJson,
  backupFiles,
  consolidateScatteredCategories,
  CONSOLIDATE_TARGET_CATEGORIES,
  loadJson,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const BACKUP_ROOT = path.join(__dirname, "backups");
const DEFAULT_CHANNELS = path.join(ROOT, "channels.json");

function getCliArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function countScatteredBlocks(channels, targetSet) {
  const counts = {};
  for (const cat of targetSet) {
    const idxs = channels.map((c, i) => (c.category === cat ? i : -1)).filter((i) => i >= 0);
    if (idxs.length <= 1) continue;
    let blocks = 1;
    for (let j = 1; j < idxs.length; j++) {
      if (idxs[j] !== idxs[j - 1] + 1) blocks++;
    }
    if (blocks > 1) counts[cat] = blocks;
  }
  return counts;
}

function main() {
  const doApply = process.argv.includes("--apply");
  const channelsPath = getCliArg("--channels") || DEFAULT_CHANNELS;
  const channels = loadJson(channelsPath);
  if (!Array.isArray(channels)) throw new Error("channels.json dizi degil");

  const before = channels.length;
  const consolidated = consolidateScatteredCategories(channels);

  if (consolidated.length !== before) {
    throw new Error(`Kanal sayisi degisti: ${before} -> ${consolidated.length}`);
  }

  const targetSet = new Set(CONSOLIDATE_TARGET_CATEGORIES);
  const scatteredBefore = countScatteredBlocks(channels, targetSet);
  const scatteredAfter = countScatteredBlocks(consolidated, targetSet);

  console.log(`Hedef kategoriler: ${CONSOLIDATE_TARGET_CATEGORIES.join(", ")}`);
  console.log(`Kanal sayisi: ${before}`);
  console.log("Daginik bloklar (once):", scatteredBefore);
  console.log("Daginik bloklar (sonra):", scatteredAfter);

  const unchanged = JSON.stringify(channels) === JSON.stringify(consolidated);
  if (unchanged) {
    console.log(`Zaten birlesik: ${channelsPath}`);
    return;
  }

  console.log("\nOrnek (45-80):");
  consolidated.slice(45, 80).forEach((c, i) => {
    console.log(`  ${45 + i}: ${c.name} | ${c.category}`);
  });

  if (!doApply) {
    console.log("\nDRY-RUN: yazmak icin --apply ekle");
    return;
  }

  const backupDir = path.join(BACKUP_ROOT, stamp());
  backupFiles([channelsPath], backupDir);
  atomicWriteJson(channelsPath, consolidated);
  console.log(`\nYedek: ${backupDir}`);
  console.log(`Yazildi: ${channelsPath}`);
}

main();
