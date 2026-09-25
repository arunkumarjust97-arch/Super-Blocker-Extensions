// content.js — cosmetic filtering: hides ad elements as early as possible and
// catches ones that get added dynamically after page load.
//
// v3.1.2: styles are injected IMMEDIATELY (before any async storage lookups) so
// ads never flash on screen; if the master switch / per-site switch turns out to
// be off, the style is removed again. Substring selectors that used to hit
// unrelated classes ("thread-container", "download-banner", "head-banner"...)
// now only match at a word boundary. hide-ads.css was never loaded by the
// manifest, so it has been removed — this file is the single source of truth.

(async function () {
  const NV = ":not(:has(video)):not(:has(audio))";

  // Match `str` only at the start of an attribute value or after a space, "-" or "_"
  // — so "ad-container" matches "top-ad-container" but NOT "download-container".
  function tok(attr, str, suffix = "") {
    return [
      `[${attr}^="${str}"]${suffix}`,
      `[${attr}*=" ${str}"]${suffix}`,
      `[${attr}*="-${str}"]${suffix}`,
      `[${attr}*="_${str}"]${suffix}`,
    ];
  }

  const BASE_SELECTORS = [
    '[id^="google_ads_iframe"]',
    '[id^="div-gpt-ad"]',
    ...tok("class", "ad-container", NV),
    ...tok("class", "ads-container", NV),
    `[class^="ad-slot"]${NV}`,
    ...tok("class", "advert-banner"),
    ...tok("class", "advertisement-banner"),
    ".advert-box",
    ...tok("id", "ad-slot", NV),
    ...tok("id", "ad_slot", NV),
    ...tok("id", "banner-ad"),
    ...tok("class", "ad-banner"),
    ...tok("class", "ad_banner"),
    "[data-ad-slot]",
    "[data-ad-client]",
    ".adsbygoogle",
    ".ad-banner",
    `.ad-wrapper${NV}`,
    `.ad-placeholder${NV}`,
    `.sponsored-content${NV}`,
    ".sponsor-banner",
    `.sticky-ad${NV}`,
    `.sticky-ads${NV}`,
    `.popup-ad${NV}`,
    `.interstitial-ad${NV}`,
    `.ad-interstitial${NV}`,
    "ins.adsbygoogle",
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="amazon-adsystem.com"]',
    'iframe[id^="google_ads_frame"]',
    'iframe[id^="aswift_"]',
    '[class*="adblock-notice"]',
    '[class*="adblock-message"]',
    '[class*="adblock-modal"]',
    '[class*="adblock-overlay"]',
    '[id*="adblock-notice"]',
    '[id*="adblock-modal"]',
    '[class*="disable-adblock"]',
    '[class*="anti-adblock"]',
    '[class*="exit-intent"]',
    '[class*="exit-popup"]',
    '[class*="newsletter-popup"]',
    '[class*="subscribe-popup"]',
    '[class*="promo-popup"]',
    '[class*="modal-overlay"]:not(:has(video))',
    '[class*="popup-overlay"]:not(:has(video))',
    '[class*="popup-modal"]:not(:has(video))',
    '[class*="lightbox-popup"]:not(:has(video))',
    '[class*="app-install-banner"]',
    '[class*="app-banner"]',
    '[class*="install-banner"]',
    '[class*="smart-banner"]',
    '[class*="announcement-bar"]',
    '[class*="promo-banner"]',
    '[class*="floating-banner"]',
    ".taboola",
    '[id^="taboola-"]',
    '[class*="outbrain"]',
    '[id*="outbrain"]',
    // Other native-ad / sponsored widgets
    ".OUTBRAIN",
    '[id^="google_image_div"]',
    // Sponsored results / posts on search, shopping and social sites
    "#tads", "#tadsb", "#bottomads", "[data-text-ad]", '[aria-label="Ads"]', ".commercial-unit-desktop-top",
    ".commercial-unit-desktop-rhs", ".pla-unit-container", ".cu-container",
    "li.b_ad", ".b_adTop", ".b_adBottom",
    '[data-testid="ad"]', ".result--ad",
    '[data-component-type="sp-sponsored-result"]', ".AdHolder", ".s-result-item:has(.puis-sponsored-label-text)",
    "shreddit-ad-post", '[data-testid="placementTracking"]',
    '[data-sponsored="true"]', "[data-is-sponsored]", '[data-ad-rendered="true"]',
    ...tok("class", "sponsored-post"), ...tok("class", "sponsored-link"), ...tok("class", "promoted-post"),
    // YouTube
    "#masthead-ad",
    "ytd-banner-promo-renderer",
    "ytd-ad-slot-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-statement-banner-renderer",
    "ytd-compact-promoted-video-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-sparkles-text-search-renderer",
    "ytd-promoted-video-renderer",
    "ytd-display-ad-renderer",
    "ytd-search-pyv-renderer",
    "ytd-brand-video-singleton-renderer",
    "ytd-brand-video-shelf-renderer",
    "ytd-rich-item-renderer:has(ytd-ad-slot-renderer)",
    "ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer)",
    "ytd-rich-section-renderer:has(ytd-statement-banner-renderer)",
    "ytd-rich-section-renderer:has(ytd-ad-slot-renderer)",
    "#player-ads",
    ".ytd-player-legacy-desktop-watch-ads-renderer",
    "ytd-action-companion-ad-renderer",
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
    ".ytp-ad-message-container",
    ".ytp-ad-action-interstitial-background-container",
    ".ytp-ad-image-overlay",
    ".ytp-ad-text-overlay",
    "ytd-mealbar-promo-renderer",
    "yt-mealbar-promo-renderer",
    // YouTube anti-adblock and "Experiencing interruptions" banners/toasts
    "ytd-enforcement-message-view-model",
    "yt-playability-error-supported-renderers",
    ".toast-button.style-scope.yt-notification-action-renderer",
    "tp-yt-paper-toast:has(.toast-button)",
    "tp-yt-paper-toast:has(#toast-text)",
    "ytd-popup-container:has(yt-notification-action-renderer)",
    "ytd-popup-container:has(ytd-enforcement-message-view-model)",
    ".paper-toast-open.yt-notification-action-renderer",
  ];

  const COOKIE_SELECTORS = [
    "#cookiebot",
    "#onetrust-banner-sdk",
    "#onetrust-consent-sdk",
    ".cookie-consent",
    ".cookie-banner",
    ".cookie-notice",
    ".cc-banner",
    ".gdpr-banner",
    '[class*="cookie-popup"]',
    '[id*="cookie-consent"]',
  ];

  const STYLE_ID = "__super_adblock_css__";
  const HIDE = "{ display: none !important; visibility: hidden !important; height: 0 !important; width: 0 !important; }";

  function buildCss(selectors) {
    return (
      selectors.join(",\n") + ` ${HIDE}\n` +
      "html.adblock-detected, body.adblock-detected, html.no-scroll, body.no-scroll { overflow: auto !important; }\n" +
      "ytd-enforcement-message-view-model, yt-playability-error-supported-renderers, yt-notification-action-renderer.paper-toast-open, tp-yt-paper-toast:has(.toast-button) { display: none !important; visibility: hidden !important; }\n"
    );
  }

  // 1) Inject immediately with the defaults (cookie banners on) — no waiting on storage.
  let styleEl = null;
  try {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = buildCss(BASE_SELECTORS.concat(COOKIE_SELECTORS));
    (document.head || document.documentElement).appendChild(styleEl);
  } catch (e) {}

  function removeStyle() {
    try { if (styleEl) styleEl.remove(); } catch (e) {}
  }

  // 2) Now honour the user's settings; undo the injection if blocking is off here.
  let settings = {};
  try {
    settings = await chrome.storage.local.get(["extensionEnabled", "disabledSites", "hideCookieBanners"]);
  } catch (e) {
    // storage unavailable: fail open (keep blocking)
  }
  const { extensionEnabled = true, disabledSites = [], hideCookieBanners = true } = settings;
  if (!extensionEnabled || disabledSites.includes(location.hostname)) {
    removeStyle();
    return;
  }

  const activeSelectors = hideCookieBanners ? BASE_SELECTORS.concat(COOKIE_SELECTORS) : BASE_SELECTORS;
  if (!hideCookieBanners && styleEl) styleEl.textContent = buildCss(activeSelectors);

  // 3) JS pass: also hides matches inline (survives sites that strip <style> tags).
  const COMBINED = activeSelectors.join(",");

  function hideAds(root) {
    let newlyHidden = 0;
    let nodes = [];
    try {
      nodes = root.querySelectorAll(COMBINED);
    } catch (e) {
      // One bad selector would break the combined query on an old browser; fall back per-selector.
      activeSelectors.forEach((sel) => {
        try { nodes = [...nodes, ...root.querySelectorAll(sel)]; } catch (e2) {}
      });
    }
    nodes.forEach((el) => {
      if (el.dataset.__adblocked) return;
      // Never hide media or anything that is part of a video player
      if (
        el.tagName === "VIDEO" ||
        el.tagName === "AUDIO" ||
        el.querySelector("video, audio") ||
        el.closest(".html5-video-player")
      ) {
        return;
      }
      el.dataset.__adblocked = "1";
      el.style.setProperty("display", "none", "important");
      newlyHidden++;
    });

    // Anti-adblock walls often lock page scroll — restore it.
    if (document.documentElement) document.documentElement.style.removeProperty("overflow");
    if (document.body) document.body.style.removeProperty("overflow");

    if (newlyHidden > 0) {
      try {
        chrome.runtime
          .sendMessage({ type: "AD_HIDDEN_COUNT", count: newlyHidden, host: location.hostname })
          .catch(() => {});
      } catch (e) {}
    }
  }

  hideAds(document.documentElement);

  // Watch for ads injected later (infinite scroll, lazy widgets) — debounced so a
  // busy page doesn't re-run the full scan on every single DOM mutation.
  let pending = false;
  const observer = new MutationObserver((mutations) => {
    if (pending) return;
    if (!mutations.some((m) => m.addedNodes.length)) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      hideAds(document.documentElement);
    }, 120);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
