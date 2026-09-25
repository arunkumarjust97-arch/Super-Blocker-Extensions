async function getActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  } catch (e) {
    return null;
  }
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return "";
  }
}

function isInternalPage(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|edge|about|brave|opera):/i.test(url);
}

async function init() {
  const tab = await getActiveTab();
  const internal = isInternalPage(tab && tab.url);
  const hostname = !internal && tab && tab.url ? hostnameFromUrl(tab.url) : "";
  const siteNameEl = document.getElementById("siteName");
  const siteToggle = document.getElementById("siteToggle");
  const siteStatus = document.getElementById("siteStatus");
  const blockedCountEl = document.getElementById("blockedCount");

  const { extensionEnabled = true } = await chrome.storage.local.get("extensionEnabled");

  if (!hostname) {
    siteNameEl.textContent = "Browser page";
    siteToggle.disabled = true;
    siteStatus.textContent = "Blocking isn't available on this page.";
  } else if (!extensionEnabled) {
    siteNameEl.textContent = hostname;
    siteToggle.disabled = true;
    siteToggle.checked = false;
    siteStatus.textContent = "Blocking is paused globally in Settings.";
  } else {
    siteNameEl.textContent = hostname;
    const { disabledSites = [] } = await chrome.storage.local.get("disabledSites");
    const isDisabled = disabledSites.includes(hostname);
    siteToggle.checked = !isDisabled;
    siteStatus.textContent = isDisabled
      ? "Blocking is OFF for this site."
      : "Blocking is ON for this site.";

    siteToggle.addEventListener("change", async () => {
      const nowOn = siteToggle.checked;
      await chrome.runtime.sendMessage({ type: "TOGGLE_SITE", hostname, enabled: nowOn });
      siteStatus.textContent = nowOn
        ? "Blocking is ON for this site. Reloading…"
        : "Blocking is OFF for this site. Reloading…";
      if (tab && tab.id) {
        chrome.tabs.reload(tab.id, () => {
          if (chrome.runtime.lastError) {
            // Ignore reload error on restricted pages
          }
        });
      }
    });
  }

  const { blockedCount = 0 } = await chrome.storage.local.get("blockedCount");
  blockedCountEl.textContent = Number(blockedCount).toLocaleString();

  // Keep blocked count updated live if ads are blocked while popup is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.blockedCount) {
      blockedCountEl.textContent = Number(changes.blockedCount.newValue || 0).toLocaleString();
    }
  });

  const cookieToggle = document.getElementById("cookieToggle");
  if (cookieToggle) {
    const { hideCookieBanners = true } = await chrome.storage.local.get("hideCookieBanners");
    cookieToggle.checked = hideCookieBanners;
    cookieToggle.addEventListener("change", async () => {
      await chrome.storage.local.set({ hideCookieBanners: cookieToggle.checked });
      if (tab && tab.id) {
        chrome.tabs.reload(tab.id, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    });
  }

  const settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL("options.html"));
      }
    });
  }
}

init();

