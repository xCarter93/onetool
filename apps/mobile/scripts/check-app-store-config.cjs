#!/usr/bin/env node
// Wave 0 static assertion of app.json's production App Store shape.
// Fails fast (exit 1) when the privacy manifest, FaceID string, version, or
// EAS-owned buildNumber invariant is missing/wrong. Run via `pnpm check:appstore`.

const app = require("../app.json");

const fail = (msg) => {
  console.error("FAIL: " + msg);
  process.exit(1);
};

const expo = app.expo;
if (!expo) fail("app.json has no expo key");
const ios = expo.ios || {};
const infoPlist = ios.infoPlist || {};
const pm = ios.privacyManifests;

// (a) version pinned to 1.0.0
if (expo.version !== "1.0.0") fail(`expo.version must be "1.0.0", got ${JSON.stringify(expo.version)}`);

// (b) ios.buildNumber must be absent (EAS remote autoIncrement owns CFBundleVersion)
if (ios.buildNumber != null) fail("expo.ios.buildNumber must be absent (EAS autoIncrement owns it)");

// (c) FaceID usage string present + non-empty
if (typeof infoPlist.NSFaceIDUsageDescription !== "string" || infoPlist.NSFaceIDUsageDescription.trim() === "") {
  fail("expo.ios.infoPlist.NSFaceIDUsageDescription must be a non-empty string");
}

// (d) privacy manifest tracking off
if (!pm) fail("expo.ios.privacyManifests is missing");
if (pm.NSPrivacyTracking !== false) fail("privacyManifests.NSPrivacyTracking must be false");

// (e) required-reason API union — exactly four categories, each with the full VERIFIED reason set
const REQUIRED = {
  NSPrivacyAccessedAPICategoryUserDefaults: ["CA92.1"],
  NSPrivacyAccessedAPICategoryFileTimestamp: ["C617.1", "0A2A.1", "3B52.1"],
  NSPrivacyAccessedAPICategorySystemBootTime: ["35F9.1"],
  NSPrivacyAccessedAPICategoryDiskSpace: ["E174.1", "85F4.1"],
};
const types = pm.NSPrivacyAccessedAPITypes;
if (!Array.isArray(types)) fail("privacyManifests.NSPrivacyAccessedAPITypes must be an array");
const declared = {};
for (const t of types) {
  declared[t.NSPrivacyAccessedAPIType] = (t.NSPrivacyAccessedAPITypeReasons || []).slice();
}
const declaredCats = Object.keys(declared).sort();
const requiredCats = Object.keys(REQUIRED).sort();
if (declaredCats.length !== requiredCats.length || declaredCats.join(",") !== requiredCats.join(",")) {
  fail(`privacy manifest categories must be exactly ${requiredCats.join(", ")}; got ${declaredCats.join(", ")}`);
}
for (const [cat, reasons] of Object.entries(REQUIRED)) {
  const got = declared[cat] || [];
  for (const r of reasons) {
    if (!got.includes(r)) fail(`privacy manifest ${cat} is missing required reason ${r}`);
  }
}

// (f) core iOS identity
if (ios.bundleIdentifier !== "biz.onetool.app") fail(`expo.ios.bundleIdentifier must be "biz.onetool.app", got ${JSON.stringify(ios.bundleIdentifier)}`);
if (ios.supportsTablet !== true) fail("expo.ios.supportsTablet must be true");
if (ios.usesAppleSignIn !== true) fail("expo.ios.usesAppleSignIn must be true");

console.log("PASS: app.json App Store production shape OK (version, no buildNumber, FaceID, privacy manifest union, bundle identity).");
process.exit(0);
