// sponsored.js — hides "Sponsored" / "Promoted" / "Ad" posts and cards in feeds
// and result lists, including ones whose class names are randomised so CSS
// selectors can't catch them. It finds the small text label, then hides the
// post/card that contains it.

(async function () {
  try {
    const { extensionEnabled = true, disabledSites = [] } =
      await chrome.storage.local.get(["extensionEnabled", "disabledSites"]);
    if (!extensionEnabled || disabledSites.includes(location.hostname)) return;
  } catch (e) {}

  // Ad-management dashboards legitimately contain the word "Ad" everywhere.
  if (/^(ads|adsmanager|business)\./i.test(location.hostname) || /adsmanager|ads\.google|advertising/i.test(location.hostname)) return;

  const LABEL = new RegExp(
    "^(sponsored|promoted|promoted by .{1,30}|sponsored by .{1,30}|paid partnership|paid promotion|" +
    "advertisement|advertisements|ad|ads|" +
    "gesponsert|anzeige|patrocinado|publicidad|sponsorisé|sponsorizzato|promocionado|" +
    "प्रायोजित|விளம்பரம்|ప్రకటన|പരസ്യം|ಜಾಹೀರಾತು)$",
    "i"
  );

  const CARD = [
    "article", "[role='article']", "li", "[data-testid='cellInnerDiv']", "[data-testid='tweet']",
    "shreddit-post", "shreddit-ad-post", "ytd-rich-item-renderer", "ytd-video-renderer",
    "ytd-compact-video-renderer", "[class*='card']", "[class*='Card']", "[class*='post']",
    "[class*='Post']", "[class*='result']", "[class*='story']", "[class*='feed-item']",
    "[class*='ListItem']", "[class*='item']",
  ].join(",");

  const SKIP_INSIDE = "nav, header, footer, button, input, textarea, select, form, [contenteditable='true'], [role='navigation'], [role='banner'], video, .html5-video-player";

  const seen = new WeakSet();

  function findCard(label) {
    let cur = label.parentElement;
    for (let hops = 0; cur && cur !== document.body && cur !== document.documentElement && hops < 9; hops++, cur = cur.parentElement) {
      if (!cur.matches(CARD)) continue;
      const len = (cur.textContent || "").trim().length;
      if (len < 60) continue; // just a wrapper around the label — keep climbing
      if (len > 4000) return null; // too big: probably a whole feed, don't risk it
      return cur;
    }
    return null;
  }

  function scan() {
    let hidden = 0;
    const candidates = document.body ? document.body.querySelectorAll("span, a, p, small, b, i, label, div, time") : [];
    for (const el of candidates) {
      if (seen.has(el)) continue;
      if (el.childElementCount !== 0) continue;
      seen.add(el);
      const text = (el.textContent || "").trim();
      if (text.length === 0 || text.length > 40 || !LABEL.test(text)) continue;
      if (el.closest(SKIP_INSIDE)) continue;
      const card = findCard(el);
      if (!card || card.dataset.__adblocked) continue;
      card.dataset.__adblocked = "1";
      card.style.setProperty("display", "none", "important");
      hidden++;
    }
    if (hidden > 0) {
      try {
        chrome.runtime.sendMessage({ type: "AD_HIDDEN_COUNT", count: hidden, host: location.hostname }).catch(() => {});
      } catch (e) {}
    }
  }

  scan();

  let pending = false;
  new MutationObserver((mutations) => {
    if (pending || !mutations.some((m) => m.addedNodes.length)) return;
    pending = true;
    setTimeout(() => { pending = false; scan(); }, 300);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
