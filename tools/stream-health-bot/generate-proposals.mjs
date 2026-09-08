#!/usr/bin/env node
/**
 * Approval-only proposal generator.
 *
 * Runs existing bots in DRY-RUN (never --apply) and consolidates:
 *   out/proposals_latest.json
 *   out/proposals_latest.md
 *   out/proposals_YYYY-MM-DD.json (dated copy)
 *
 * Usage:
 *   node tools/stream-health-bot/generate-proposals.mjs
 *   node tools/stream-health-bot/generate-proposals.mjs --aggregate-only
 *   node tools/stream-health-bot/generate-proposals.mjs --skip-enrich --health-all-tv
 *
 * Env:
 *   PROPOSAL_STEP_TIMEOUT_MS  per-bot timeout (default 45 min)
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  atomicWriteJson,
  loadJson,
  normalizeChannelKey,
  shouldSkipImportEntry,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(__dirname, "out");
const CHANNELS_PATH = path.join(ROOT, "channels.json");
const STREAM_MAP_PATH = path.join(ROOT, "stream_map.json");

const args = new Set(process.argv.slice(2));
const aggregateOnly = args.has("--aggregate-only");
const skipHealth = args.has("--skip-health");
const skipEnrich = args.has("--skip-enrich");
const skipDiscover = args.has("--skip-discover");
const healthAllTv = args.has("--health-all-tv");

const STEP_TIMEOUT_MS = Number(process.env.PROPOSAL_STEP_TIMEOUT_MS) || 45 * 60 * 1000;

function log(...a) {
  console.log("[proposals]", ...a);
}

function stampDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildNameIndex(channels) {
  const byKey = new Map();
  for (const ch of channels) {
    const name = String(ch?.name || "").trim();
    if (!name) continue;
    byKey.set(normalizeChannelKey(name), name);
  }
  return byKey;
}

function runNodeScript(scriptRel, scriptArgs, label) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, scriptRel);
    const fullArgs = [scriptPath, ...scriptArgs];
    log(`Baslat: ${label} → node ${scriptRel} ${scriptArgs.join(" ")}`);
    const child = spawn(process.execPath, fullArgs, {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      process.stderr.write(s);
    });

    const timer = setTimeout(() => {
      log(`TIMEOUT ${label} (${STEP_TIMEOUT_MS}ms) — surec sonlandiriliyor`);
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000);
    }, STEP_TIMEOUT_MS);

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        label,
        ok: code === 0,
        code,
        signal,
        timedOut: signal === "SIGTERM" || signal === "SIGKILL",
        stdout,
        stderr,
      });
    });
  });
}

function pushProposal(list, seen, proposal) {
  const key = [
    proposal.action,
    proposal.channelKey || "",
    proposal.url || "",
    proposal.channelName || "",
  ].join("|");
  if (seen.has(key)) return;
  seen.add(key);

  const mode =
    proposal.action === "add_url"
      ? "enrich"
      : proposal.action === "add_channel"
        ? "discover"
        : "import";
  if (proposal.action !== "remove_url") {
    const skip = shouldSkipImportEntry({
      name: proposal.channelName || proposal.channelKey,
      url: proposal.url,
      mode,
    });
    if (skip.skip) {
      log(`Politika atlandi: ${proposal.action} ${proposal.channelName} (${skip.reason})`);
      return;
    }
  }

  list.push({
    action: proposal.action,
    channelName: proposal.channelName || proposal.channelKey || "",
    channelKey: proposal.channelKey || normalizeChannelKey(proposal.channelName || ""),
    url: proposal.url || "",
    source: proposal.source || "",
    reason: proposal.reason || "",
  });
}

function collectFromHealth(report, nameByKey, proposals, seen) {
  if (!report?.changed?.length) return;
  for (const row of report.changed) {
    const channelKey = row.key;
    const channelName = nameByKey.get(channelKey) || channelKey;
    for (const url of row.removedUrls || []) {
      pushProposal(proposals, seen, {
        action: "remove_url",
        channelName,
        channelKey,
        url,
        source: "stream-health-bot",
        reason: `2-strike olu link (fail streak >= 2), dry-run`,
      });
    }
    for (const url of row.addedUrls || []) {
      pushProposal(proposals, seen, {
        action: "add_url",
        channelName,
        channelKey,
        url,
        source: "stream-health-bot",
        reason: "M3U/health dry-run: yeni canli URL",
      });
    }
  }
}

function collectFromEnrich(report, nameByKey, proposals, seen) {
  for (const row of report?.enriched || []) {
    const channelKey = row.key;
    const channelName = nameByKey.get(channelKey) || channelKey;
    for (const url of row.urls || []) {
      pushProposal(proposals, seen, {
        action: "add_url",
        channelName,
        channelKey,
        url,
        source: "enrich-stream-map",
        reason: "M3U enrich dry-run: alternatif URL",
      });
    }
  }
}

function collectFromDiscover(report, proposals, seen) {
  for (const row of report?.discovered || []) {
    const urls = row.urls || [];
    if (!urls.length) continue;
    // First URL = new channel; remaining = extra URLs for same new channel
    pushProposal(proposals, seen, {
      action: "add_channel",
      channelName: row.name,
      channelKey: row.key,
      url: urls[0],
      source: "discover-missing-channels",
      reason: "TKGS/eksik liste dry-run: yeni kanal",
    });
    for (const url of urls.slice(1)) {
      pushProposal(proposals, seen, {
        action: "add_url",
        channelName: row.name,
        channelKey: row.key,
        url,
        source: "discover-missing-channels",
        reason: "Yeni kanal icin ek URL (dry-run)",
      });
    }
  }
}

function toMarkdown(payload) {
  const lines = [
    "# Stream Health — Onay Bekleyen Teklifler",
    "",
    `Olusturulma: ${payload.generatedAt}`,
    `Toplam teklif: **${payload.proposals.length}**`,
    "",
    `| action | add_url | add_channel | remove_url |`,
    `| --- | ---: | ---: | ---: |`,
    `| adet | ${payload.summary.add_url} | ${payload.summary.add_channel} | ${payload.summary.remove_url} |`,
    "",
    "> Bu dosya **yalnizca teklif** icerir. `channels.json` / `stream_map.json` otomatik degistirilmez.",
    "",
    "## Calisma ozeti",
    "",
  ];

  for (const run of payload.runs || []) {
    const status = run.ok ? "OK" : run.timedOut ? "TIMEOUT" : `FAIL(${run.code})`;
    lines.push(`- \`${run.label}\`: ${status}${run.skipped ? " (atlandi)" : ""}`);
  }

  lines.push("", "## Teklifler", "");
  if (!payload.proposals.length) {
    lines.push("_Teklif yok._", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| # | action | kanal | key | url | kaynak | neden |");
  lines.push("| ---: | --- | --- | --- | --- | --- | --- |");
  payload.proposals.forEach((p, i) => {
    const url = String(p.url || "").replace(/\|/g, "\\|");
    lines.push(
      `| ${i + 1} | ${p.action} | ${p.channelName} | ${p.channelKey} | ${url} | ${p.source} | ${p.reason} |`,
    );
  });
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const now = new Date().toISOString();
  const channels = loadJson(CHANNELS_PATH, []);
  const nameByKey = buildNameIndex(Array.isArray(channels) ? channels : []);

  const runs = [];
  const mapArgs = ["--stream-map", STREAM_MAP_PATH, "--channels", CHANNELS_PATH];

  if (!aggregateOnly) {
    if (!skipHealth) {
      const healthArgs = [...mapArgs];
      if (healthAllTv) healthArgs.push("--all-tv");
      // NEVER --apply
      runs.push(
        await runNodeScript("stream-health-bot.mjs", healthArgs, "health"),
      );
    } else {
      runs.push({ label: "health", ok: true, skipped: true });
    }

    if (!skipEnrich) {
      runs.push(
        await runNodeScript("enrich-stream-map.mjs", mapArgs, "enrich"),
      );
    } else {
      runs.push({ label: "enrich", ok: true, skipped: true });
    }

    if (!skipDiscover) {
      runs.push(
        await runNodeScript("discover-missing-channels.mjs", mapArgs, "discover"),
      );
    } else {
      runs.push({ label: "discover", ok: true, skipped: true });
    }
  } else {
    log("aggregate-only: mevcut raporlar okunacak");
    runs.push({ label: "aggregate-only", ok: true, skipped: false });
  }

  const healthReport = loadJson(path.join(OUT_DIR, "maintain_report.json"), null);
  const enrichReport = loadJson(path.join(OUT_DIR, "enrich_report.json"), null);
  const discoverReport = loadJson(path.join(OUT_DIR, "discover_report.json"), null);

  const proposals = [];
  const seen = new Set();
  collectFromHealth(healthReport, nameByKey, proposals, seen);
  collectFromEnrich(enrichReport, nameByKey, proposals, seen);
  collectFromDiscover(discoverReport, proposals, seen);

  const summary = {
    add_url: proposals.filter((p) => p.action === "add_url").length,
    add_channel: proposals.filter((p) => p.action === "add_channel").length,
    remove_url: proposals.filter((p) => p.action === "remove_url").length,
  };

  const payload = {
    generatedAt: now,
    mode: "proposal-only",
    applied: false,
    catalogTouched: false,
    summary,
    runs: runs.map((r) => ({
      label: r.label,
      ok: !!r.ok,
      code: r.code ?? null,
      timedOut: !!r.timedOut,
      skipped: !!r.skipped,
    })),
    sources: {
      health: healthReport?.generatedAt || null,
      enrich: enrichReport?.generatedAt || null,
      discover: discoverReport?.generatedAt || null,
    },
    proposals,
  };

  const jsonPath = path.join(OUT_DIR, "proposals_latest.json");
  const mdPath = path.join(OUT_DIR, "proposals_latest.md");
  const datedJson = path.join(OUT_DIR, `proposals_${stampDate()}.json`);

  atomicWriteJson(jsonPath, payload);
  fs.writeFileSync(mdPath, toMarkdown(payload), "utf8");
  atomicWriteJson(datedJson, payload);

  log(`Yazildi: ${jsonPath}`);
  log(`Yazildi: ${mdPath}`);
  log(`Yazildi: ${datedJson}`);
  log(
    `Ozet: ${proposals.length} teklif (add_url=${summary.add_url}, add_channel=${summary.add_channel}, remove_url=${summary.remove_url})`,
  );
  log("channels.json / stream_map.json DEGISTIRILMEDI.");
}

main().catch((err) => {
  console.error("[proposals] HATA:", err);
  process.exit(1);
});
