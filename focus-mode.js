// focus-mode.js — runs on every site except YouTube (which has its own
// dedicated ad-handling scripts and where autoplay is usually something the
// user actually wants). Stops videos from autoplaying the moment the page
// loads — hero/background videos, article-embedded video ads, promo clips —
// so playback only starts when the person actually clicks play themselves.
//
// Safety: this never removes or disables the video, only pauses it and
// strips the autoplay attribute. A user who clicks the native play button
// gets normal playback immediately — nothing here blocks manual play().

(async function () {
  // Respect master on/off switch and per-site disable toggle.
  try {
    const { extensionEnabled = true } = await chrome.storage.local.get("extensionEnabled");
    if (!extensionEnabled) return;
  } catch (e) {}

  try {
    const { disabledSites = [] } = await chrome.storage.local.get("disabledSites");
    if (disabledSites.includes(location.hostname)) return;
  } catch (e) {}

  let focusMode = true;
  try {
    const stored = await chrome.storage.local.get("focusMode");
    if (typeof stored.focusMode === "boolean") focusMode = stored.focusMode;
  } catch (e) {}
  if (!focusMode) return;

  // Only auto-pause videos the page itself started, before the person did
  // anything. Once they've clicked/tapped/typed, leave every video alone —
  // this is "stop uninvited autoplay", not "block video playback".
  let userInteracted = false;
  ["click", "keydown", "touchstart"].forEach((evt) => {
    document.addEventListener(evt, () => { userInteracted = true; }, { capture: true, once: true });
  });

  function isPrimaryVideo(video) {
    if (video.controls) return true;
    if (video.closest(".html5-video-player, .video-js, .jwplayer, [class*='player'], [id*='player']")) return true;
    try {
      const rect = video.getBoundingClientRect();
      if (rect.width >= 400 && rect.height >= 250) return true;
    } catch (e) {}
    return false;
  }

  function stopIfUninvited(video) {
    if (userInteracted || video.__focusModeChecked) return;
    video.__focusModeChecked = true;

    // Never interfere with primary content video players
    if (isPrimaryVideo(video)) return;

    if (video.hasAttribute("autoplay") || (!video.paused && video.currentTime < 1)) {
      video.removeAttribute("autoplay");
      video.pause();
    }
  }

  function scan(root) {
    root.querySelectorAll("video").forEach(stopIfUninvited);
  }

  scan(document.documentElement);

  const observer = new MutationObserver((mutations) => {
    if (userInteracted) {
      observer.disconnect();
      return;
    }
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.tagName === "VIDEO") stopIfUninvited(node);
        else scan(node);
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Stop watching once the person interacts — no point paying the cost of
  // an observer for a feature that only acts before any interaction.
  document.addEventListener(
    "click",
    () => observer.disconnect(),
    { capture: true, once: true }
  );
})();
