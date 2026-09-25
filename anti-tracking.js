// anti-tracking.js — strips the tracking parameters advertisers attach to
// links (fbclid, gclid, utm_*, etc.) so clicking a link, or landing on this
// page from one, doesn't hand an advertiser an ID that follows you across
// sites. Runs on every page; only touches URLs, never page content.

(async function () {
  try {
    const { extensionEnabled = true } = await chrome.storage.local.get("extensionEnabled");
    if (!extensionEnabled) return;
  } catch (e) {}

  try {
    const { disabledSites = [] } = await chrome.storage.local.get("disabledSites");
    if (disabledSites.includes(location.hostname)) return;
  } catch (e) {}

  let blockTrackers = true;
  try {
    const stored = await chrome.storage.local.get("blockTrackers");
    if (typeof stored.blockTrackers === "boolean") blockTrackers = stored.blockTrackers;
  } catch (e) {}
  if (!blockTrackers) return;

  const TRACKING_PARAMS = [
    "fbclid", "gclid", "gclsrc", "dclid", "msclkid", "twclid", "ttclid", "yclid",
    "igshid", "mc_eid", "mc_cid", "ref_src", "ref_url",
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  ];

  function stripParams(urlStr) {
    let url;
    try {
      url = new URL(urlStr, location.href);
    } catch (e) {
      return null;
    }
    let changed = false;
    TRACKING_PARAMS.forEach((p) => {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        changed = true;
      }
    });
    return changed ? url : null;
  }

  // 1) Clean the current page's own address bar URL (no reload/navigation —
  // just replaces the visible URL, same as the site's own SPA routing would).
  const cleanedSelf = stripParams(location.href);
  if (cleanedSelf) {
    try {
      history.replaceState(history.state, "", cleanedSelf.toString());
    } catch (e) {}
  }

  // 2) Clean outgoing links on the page so clicking them doesn't carry a
  // tracking ID to the destination site either.
  function cleanLink(a) {
    if (!a.href || a.dataset.__trackerCleaned) return;
    const cleaned = stripParams(a.href);
    if (cleaned) {
      a.href = cleaned.toString();
    }
    a.dataset.__trackerCleaned = "1";
  }

  function scan(root) {
    root.querySelectorAll("a[href]").forEach(cleanLink);
  }

  scan(document.documentElement);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.tagName === "A") cleanLink(node);
        else scan(node);
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
