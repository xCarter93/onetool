#!/usr/bin/env node
// Privacy-manifest DRIFT check. Scans the installed dependency PrivacyInfo.xcprivacy
// files, builds the union of every (category, reason) required-reason API pair, and
// asserts that union is a SUBSET of what app.json's expo.ios.privacyManifests declares.
// A future Expo/RN dep bump that introduces a new required-reason API the app.json
// under-declares is caught here (App Store rejection risk).
//
// Default: exit 1 on drift (CI-blocking). With --advisory: downgrade drift to a
// warning and exit 0 (so it does not block the standard check:appstore flow).
// If no manifests are found (deps not installed), print a skip note and exit 0.

const fs = require("fs");
const path = require("path");

const advisory = process.argv.includes("--advisory");
const app = require("../app.json");

// pnpm hoists most manifests to the REPO-ROOT node_modules; some land in apps/mobile/node_modules.
const ROOTS = [
  path.join(__dirname, "..", "..", "..", "node_modules"), // repo-root node_modules
  path.join(__dirname, "..", "node_modules"), // apps/mobile/node_modules
];

function findManifests(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      findManifests(full, out);
    } else if (e.isFile() && e.name === "PrivacyInfo.xcprivacy" && path.basename(dir) === "ios") {
      out.push(full);
    }
  }
}

const manifests = [];
for (const root of ROOTS) findManifests(root, manifests);

if (manifests.length === 0) {
  console.log("SKIP: no installed PrivacyInfo.xcprivacy manifests found (deps not installed?). Nothing to check.");
  process.exit(0);
}

// Lightweight plist parse: split per NSPrivacyAccessedAPIType block, collect reasons.
function parseManifest(xml) {
  const pairs = [];
  const typeRe =
    /<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>([\s\S]*?)(?=<key>NSPrivacyAccessedAPIType<\/key>|<\/array>)/g;
  let m;
  while ((m = typeRe.exec(xml))) {
    const cat = m[1].trim();
    const reasons = [...m[2].matchAll(/<string>([^<]+)<\/string>/g)].map((x) => x[1].trim());
    for (const r of reasons) pairs.push([cat, r]);
  }
  return pairs;
}

// Build the installed union.
const union = {}; // category -> Set(reasons)
for (const file of manifests) {
  const xml = fs.readFileSync(file, "utf8");
  for (const [cat, reason] of parseManifest(xml)) {
    (union[cat] = union[cat] || new Set()).add(reason);
  }
}

// Load app.json declaration.
const declared = {}; // category -> Set(reasons)
const types = (((app.expo || {}).ios || {}).privacyManifests || {}).NSPrivacyAccessedAPITypes || [];
for (const t of types) {
  declared[t.NSPrivacyAccessedAPIType] = new Set(t.NSPrivacyAccessedAPITypeReasons || []);
}

// Assert union ⊆ declared.
const drift = [];
for (const cat of Object.keys(union).sort()) {
  for (const reason of [...union[cat]].sort()) {
    if (!declared[cat] || !declared[cat].has(reason)) {
      drift.push({ cat, reason });
    }
  }
}

console.log(`Scanned ${manifests.length} installed PrivacyInfo.xcprivacy manifest(s).`);

if (drift.length === 0) {
  console.log("PASS: no drift — installed required-reason API union is a subset of app.json's declaration.");
  process.exit(0);
}

for (const d of drift) {
  console.error(`DRIFT: app.json under-declares ${d.cat} ${d.reason}`);
}

if (advisory) {
  console.warn(`WARN (advisory): ${drift.length} drift item(s) found; not failing because --advisory is set.`);
  process.exit(0);
}
console.error(`FAIL: ${drift.length} drift item(s) found. Update expo.ios.privacyManifests in app.json.`);
process.exit(1);
