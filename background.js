// background.js — tracks blocked-request counts and manages per-site disable

const DYNAMIC_RULE_ID_BASE = 100000; // avoid clashing with static rule ids
const ALL_RULESET_IDS = ["ruleset_1", "ruleset_2", "ruleset_3", "ruleset_4", "ruleset_5", "ruleset_6", "ruleset_7"];

// Rulesets that have their own dedicated on/off switch in Settings, beyond
// the master toggle. storageKey defaults to true (on) when unset.
const TOGGLEABLE_RULESETS = [
  { storageKey: "browseFaster", rulesetId: "ruleset_6" },
  { storageKey: "blockTrackers", rulesetId: "ruleset_7" },
];

async function syncMasterEnabled() {
  const { extensionEnabled = true } = await chrome.storage.local.get("extensionEnabled");
  if (extensionEnabled) {
    const toggleStates = await chrome.storage.local.get(TOGGLEABLE_RULESETS.map((t) => t.storageKey));
    const offRulesetIds = TOGGLEABLE_RULESETS.filter(
      (t) => toggleStates[t.storageKey] === false
    ).map((t) => t.rulesetId);
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: ALL_RULESET_IDS.filter((id) => !offRulesetIds.includes(id)),
      disableRulesetIds: offRulesetIds,
    });
  } else {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ALL_RULESET_IDS });
  }
}

async function syncToggleableRuleset(storageKey) {
  const entry = TOGGLEABLE_RULESETS.find((t) => t.storageKey === storageKey);
  if (!entry) return;
  const { extensionEnabled = true } = await chrome.storage.local.get("extensionEnabled");
  if (!extensionEnabled) return; // master switch already has everything disabled
  const stored = await chrome.storage.local.get(storageKey);
  const on = stored[storageKey] !== false;
  if (on) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: [entry.rulesetId] });
  } else {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: [entry.rulesetId] });
  }
}

async function getDisabledSites() {
  const { disabledSites = [] } = await chrome.storage.local.get("disabledSites");
  return disabledSites;
}

// Synchronize declarativeNetRequest dynamic rules for all disabled sites.
// For each disabled domain, we:
// 1) Allow all requests on the frame/subframes using allowAllRequests on requestDomains: [hostname]
// 2) Allow all subrequests initiated by the domain using allow on initiatorDomains: [hostname]
async function syncDisabledSitesRules() {
  const { disabledSites = [] } = await chrome.storage.local.get("disabledSites");
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingDynamicIds = existingRules.map((r) => r.id);

  const newRules = [];
  disabledSites.forEach((hostname, idx) => {
    if (!hostname || typeof hostname !== "string") return;
    const baseId = DYNAMIC_RULE_ID_BASE + idx * 2;
    // Allow all requests on this page and child frames
    newRules.push({
      id: baseId,
      priority: 1000,
      action: { type: "allowAllRequests" },
      condition: {
        requestDomains: [hostname],
        resourceTypes: ["main_frame", "sub_frame"],
      },
    });
    // Allow all subresource requests initiated by this site
    newRules.push({
      id: baseId + 1,
      priority: 1000,
      action: { type: "allow" },
      condition: {
        initiatorDomains: [hostname],
      },
    });
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingDynamicIds,
    addRules: newRules,
  });
}

// Track blocked-request counts (network-level) using the DNR match-notifier API
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const { blockedCount = 0 } = await chrome.storage.local.get("blockedCount");
    await chrome.storage.local.set({ blockedCount: blockedCount + 1 });
  });
}

// Track cosmetic-hide counts reported by content scripts & site toggles
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg && msg.type === "AD_HIDDEN_COUNT") {
    const addCount = typeof msg.count === "number" && msg.count > 0 ? msg.count : 1;
    const { blockedCount = 0 } = await chrome.storage.local.get("blockedCount");
    await chrome.storage.local.set({ blockedCount: blockedCount + addCount });
  }
  if (msg && msg.type === "TOGGLE_SITE" && msg.hostname) {
    const disabledSites = await getDisabledSites();
    const idx = disabledSites.indexOf(msg.hostname);
    if (typeof msg.enabled === "boolean") {
      if (msg.enabled && idx >= 0) {
        disabledSites.splice(idx, 1);
      } else if (!msg.enabled && idx < 0) {
        disabledSites.push(msg.hostname);
      }
    } else {
      if (idx >= 0) {
        disabledSites.splice(idx, 1);
      } else {
        disabledSites.push(msg.hostname);
      }
    }
    await chrome.storage.local.set({ disabledSites });
    // syncDisabledSitesRules() is triggered automatically via chrome.storage.onChanged
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.extensionEnabled) {
    syncMasterEnabled();
  }
  if (changes.disabledSites) {
    syncDisabledSitesRules();
  }
  TOGGLEABLE_RULESETS.forEach((t) => {
    if (changes[t.storageKey]) syncToggleableRuleset(t.storageKey);
  });
});

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([
    "blockedCount",
    "disabledSites",
    "extensionEnabled",
    "hideCookieBanners",
    "focusMode",
    "browseFaster",
    "blockTrackers",
  ]);
  if (existing.blockedCount === undefined) {
    await chrome.storage.local.set({ blockedCount: 0 });
  }
  if (existing.disabledSites === undefined) {
    await chrome.storage.local.set({ disabledSites: [] });
  }
  if (existing.extensionEnabled === undefined) {
    await chrome.storage.local.set({ extensionEnabled: true });
  }
  if (existing.hideCookieBanners === undefined) {
    await chrome.storage.local.set({ hideCookieBanners: true });
  }
  if (existing.focusMode === undefined) {
    await chrome.storage.local.set({ focusMode: true });
  }
  if (existing.browseFaster === undefined) {
    await chrome.storage.local.set({ browseFaster: true });
  }
  if (existing.blockTrackers === undefined) {
    await chrome.storage.local.set({ blockTrackers: true });
  }
  await syncMasterEnabled();
  await syncDisabledSitesRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncMasterEnabled();
  await syncDisabledSitesRules();
});

