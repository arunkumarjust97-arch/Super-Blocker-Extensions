// browse-faster.js — reduces resource usage on every page load by deferring
// media the person can't see yet: offscreen images/iframes get native lazy
// loading, and offscreen videos are told not to preload their data. Nothing
// visible in the current viewport is touched, and everything still loads
// normally the instant it's scrolled into view — this only delays work the
// browser would otherwise do immediately for content that isn't on screen.

(async function () {
  try {
    const { extensionEnabled = true } = await chrome.storage.local.get("extensionEnabled");
    if (!extensionEnabled) return;
  } catch (e) {}

  try {
    const { disabledSites = [] } = await chrome.storage.local.get("disabledSites");
    if (disabledSites.includes(location.hostname)) return;
  } catch (e) {}

  let browseFaster = true;
  try {
    const stored = await chrome.storage.local.get("browseFaster");
    if (typeof stored.browseFaster === "boolean") browseFaster = stored.browseFaster;
  } catch (e) {}
  if (!browseFaster) return;

  const viewportH = () => window.innerHeight || document.documentElement.clientHeight;

  function isOffscreen(el) {
    const r = el.getBoundingClientRect();
    // A little slack below the fold so near-visible content still loads eagerly.
    return r.top > viewportH() * 1.5;
  }

  function speedUp(el) {
    if (el.__browseFasterChecked) return;
    el.__browseFasterChecked = true;

    if (el.tagName === "IMG" || el.tagName === "IFRAME") {
      if (!el.hasAttribute("loading") && isOffscreen(el)) {
        el.setAttribute("loading", "lazy");
      }
    } else if (el.tagName === "VIDEO") {
      if (!el.hasAttribute("autoplay") && !el.hasAttribute("preload") && isOffscreen(el)) {
        el.setAttribute("preload", "none");
      }
    }
  }

  function scan(root) {
    root.querySelectorAll("img, iframe, video").forEach(speedUp);
  }

  scan(document.documentElement);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches && node.matches("img, iframe, video")) speedUp(node);
        else scan(node);
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
