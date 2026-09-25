function hostnameFromInput(raw) {
  let value = raw.trim().toLowerCase();
  if (!value) return "";
  // Allow pasting a full URL or a bare hostname
  try {
    if (!/^https?:\/\//.test(value)) value = "https://" + value;
    return new URL(value).hostname;
  } catch (e) {
    return "";
  }
}

async function renderDisabledSites() {
  const listEl = document.getElementById("disabledList");
  const emptyMsg = document.getElementById("emptyMsg");
  const { disabledSites = [] } = await chrome.storage.local.get("disabledSites");

  listEl.innerHTML = "";
  emptyMsg.hidden = disabledSites.length !== 0;
  document.getElementById("disabledCount").textContent = disabledSites.length;

  disabledSites.forEach((hostname) => {
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.textContent = hostname;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "Enable blocking";
    removeBtn.addEventListener("click", async () => {
      const { disabledSites: current = [] } = await chrome.storage.local.get("disabledSites");
      const updated = current.filter((site) => site !== hostname);
      await chrome.storage.local.set({ disabledSites: updated });
      renderDisabledSites();
    });

    li.appendChild(name);
    li.appendChild(removeBtn);
    listEl.appendChild(li);
  });
}

async function renderStats() {
  const { blockedCount = 0 } = await chrome.storage.local.get("blockedCount");
  document.getElementById("blockedCount").textContent = blockedCount.toLocaleString();
}

async function renderMasterToggle() {
  const { extensionEnabled = true } = await chrome.storage.local.get("extensionEnabled");
  const toggle = document.getElementById("masterToggle");
  const hint = document.getElementById("masterHint");
  const title = document.querySelector(".master-card h2");
  toggle.checked = extensionEnabled;
  title.textContent = extensionEnabled ? "Blocking is on" : "Blocking is off";
  hint.textContent = extensionEnabled
    ? "Ads, trackers and cookie pop-ups are being blocked on every site."
    : "Blocking is paused everywhere. Turn it back on to resume protection.";
}

async function renderCookieToggle() {
  const { hideCookieBanners = true } = await chrome.storage.local.get("hideCookieBanners");
  document.getElementById("cookieToggle").checked = hideCookieBanners;
}

async function renderFocusToggle() {
  const { focusMode = true } = await chrome.storage.local.get("focusMode");
  document.getElementById("focusToggle").checked = focusMode;
}

async function renderSpeedToggle() {
  const { browseFaster = true } = await chrome.storage.local.get("browseFaster");
  document.getElementById("speedToggle").checked = browseFaster;
}

async function renderTrackerToggle() {
  const { blockTrackers = true } = await chrome.storage.local.get("blockTrackers");
  document.getElementById("trackerToggle").checked = blockTrackers;
}

function showDataMsg(text) {
  const el = document.getElementById("dataMsg");
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4000);
}

async function renderAll() {
  const version = chrome.runtime.getManifest().version;
  document.getElementById("versionLabel").textContent = "Version " + version;

  const aboutVersion = document.getElementById("aboutVersion");
  if (aboutVersion) aboutVersion.textContent = "v" + version;

  const copyrightLine = document.getElementById("copyrightLine");
  if (copyrightLine) {
    copyrightLine.textContent =
      "\u00A9 " + new Date().getFullYear() + " Arun Kumar. All rights reserved.";
  }

  await Promise.all([
    renderMasterToggle(),
    renderStats(),
    renderCookieToggle(),
    renderFocusToggle(),
    renderSpeedToggle(),
    renderTrackerToggle(),
    renderDisabledSites(),
  ]);
}

document.getElementById("masterToggle").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ extensionEnabled: e.target.checked });
  await renderMasterToggle();
});

document.getElementById("cookieToggle").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ hideCookieBanners: e.target.checked });
});

document.getElementById("focusToggle").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ focusMode: e.target.checked });
});

document.getElementById("speedToggle").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ browseFaster: e.target.checked });
});

document.getElementById("trackerToggle").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ blockTrackers: e.target.checked });
});

document.getElementById("resetBtn").addEventListener("click", async () => {
  await chrome.storage.local.set({ blockedCount: 0 });
  renderStats();
});

document.getElementById("addSiteBtn").addEventListener("click", async () => {
  const input = document.getElementById("addSiteInput");
  const hostname = hostnameFromInput(input.value);
  if (!hostname) return;
  const { disabledSites = [] } = await chrome.storage.local.get("disabledSites");
  if (!disabledSites.includes(hostname)) {
    disabledSites.push(hostname);
    await chrome.storage.local.set({ disabledSites });
  }
  input.value = "";
  renderDisabledSites();
});

document.getElementById("addSiteInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("addSiteBtn").click();
});

document.getElementById("exportBtn").addEventListener("click", async () => {
  const data = await chrome.storage.local.get([
    "disabledSites",
    "hideCookieBanners",
    "focusMode",
    "browseFaster",
    "blockTrackers",
    "extensionEnabled",
    "blockedCount",
  ]);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "super-ad-blocker-settings.json";
  a.click();
  URL.revokeObjectURL(url);
  showDataMsg("Settings exported.");
});

document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});

document.getElementById("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const toSave = {};
    if (Array.isArray(parsed.disabledSites)) toSave.disabledSites = parsed.disabledSites;
    if (typeof parsed.hideCookieBanners === "boolean") toSave.hideCookieBanners = parsed.hideCookieBanners;
    if (typeof parsed.focusMode === "boolean") toSave.focusMode = parsed.focusMode;
    if (typeof parsed.browseFaster === "boolean") toSave.browseFaster = parsed.browseFaster;
    if (typeof parsed.blockTrackers === "boolean") toSave.blockTrackers = parsed.blockTrackers;
    if (typeof parsed.extensionEnabled === "boolean") toSave.extensionEnabled = parsed.extensionEnabled;
    if (typeof parsed.blockedCount === "number") toSave.blockedCount = parsed.blockedCount;
    await chrome.storage.local.set(toSave);
    await renderAll();
    showDataMsg("Settings imported.");
  } catch (err) {
    showDataMsg("That file couldn't be read as settings.");
  }
  e.target.value = "";
});

document.getElementById("clearAllBtn").addEventListener("click", async () => {
  const ok = confirm("Reset all settings, exceptions and stats to defaults?");
  if (!ok) return;
  await chrome.storage.local.set({
    disabledSites: [],
    hideCookieBanners: true,
    focusMode: true,
    browseFaster: true,
    blockTrackers: true,
    extensionEnabled: true,
    blockedCount: 0,
  });
  await renderAll();
  showDataMsg("All data cleared.");
});

// Keep options page synchronized in real time if changed from popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    renderAll();
  }
});

renderAll();
