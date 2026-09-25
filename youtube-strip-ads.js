// youtube-strip-ads.js — runs on YouTube in the MAIN world at document_start.
// Safely empties ad placements from player responses before the player reads them,
// ensuring media streams (streamingData) remain completely intact and valid.

(function () {
  // Debug switches (set in the DevTools console on youtube.com, then reload the tab):
  //   localStorage.sab_yt_off  = "1"  -> this script does nothing (test if it causes playback problems)
  //   localStorage.sab_yt_ssap = "1"  -> also remove server-side ad config (off by default: riskier)
  const flag = (k) => {
    try {
      return window.localStorage.getItem(k) === "1";
    } catch (e) {
      return false;
    }
  };
  if (flag("sab_yt_off")) return;

  // Known ad-scheduling fields in YouTube player responses.
  const AD_KEYS = [
    "playerAds",
    "adBreakHeartbeatParams",
    "adBreakServiceEndpoint",
    "playerAdParams",
    "adVideoId",
    "adPlacementConfig",
    "adBreakParams",
    "adSenseParams",
    "instreamAdPlayerResponse",
    "adTag",
    "adFlags",
    "adSignals",
    "adLoggingConfig",
  ];
  // Server-side ad insertion config: removing it can interrupt playback on some videos,
  // so it is opt-in only.
  if (flag("sab_yt_ssap")) AD_KEYS.push("ssapConfig");

  const AD_KEY_SET = new Set(AD_KEYS);

  // Cheap pre-check on raw JSON text: only parse+walk payloads that can contain ad data.
  // Big YouTube payloads (2-3 MB) are otherwise walked on the main thread for nothing.
  const AD_MARKER = /adPlacements|adSlots|playerAds|adSlotRenderer|ssapConfig|romotedSparkles|romotedVideo|searchPyvRenderer|displayAdRenderer|"isAd"|instreamAdPlayerResponse|adBreakHeartbeatParams|playerAdParams|adBreakServiceEndpoint|adBreakParams/;
  function hasAdMarker(text) {
    return typeof text === "string" && AD_MARKER.test(text);
  }

  // Keys that start with "ad" but are NOT ads — never touch these!
  const SAFE_AD_PREFIXED_KEYS = new Set([
    "adaptiveFormats",
    "address",
    "addedText",
    "additionalAudioFormats",
  ]);

  // Sponsored items that appear inside feed / search / Shorts lists.
  function isFeedAdItem(item) {
    if (!item || typeof item !== "object") return false;
    if (item.adSlotRenderer || item.promotedSparklesWebRenderer ||
        item.promotedVideoRenderer || item.compactPromotedVideoRenderer ||
        item.searchPyvRenderer || item.displayAdRenderer) return true;
    const rich = item.richItemRenderer;
    if (rich && rich.content && rich.content.adSlotRenderer) return true;
    const reel = item.command && item.command.reelWatchEndpoint;
    if (reel && reel.adClientParams && reel.adClientParams.isAd) return true;
    return false;
  }

  function stripAds(obj, depth) {
    if (!obj || typeof obj !== "object" || depth > 14) return obj;

    if (Array.isArray(obj)) {
      for (let i = obj.length - 1; i >= 0; i--) {
        if (isFeedAdItem(obj[i])) {
          obj.splice(i, 1);
        } else {
          stripAds(obj[i], depth + 1);
        }
      }
      return obj;
    }

    // Safely empty ad placement lists rather than deleting the keys entirely,
    // which prevents YouTube's player initialization scripts from throwing TypeErrors.
    if ("adPlacements" in obj && Array.isArray(obj.adPlacements)) {
      obj.adPlacements = [];
    }
    if ("adSlots" in obj && Array.isArray(obj.adSlots)) {
      obj.adSlots = [];
    }
    if ("playerAds" in obj && Array.isArray(obj.playerAds)) {
      obj.playerAds = [];
    }
    if ("adBreaks" in obj && Array.isArray(obj.adBreaks)) {
      obj.adBreaks = [];
    }

    // Neutralize YouTube anti-adblock playback errors and playability blocks
    if (obj.playabilityStatus && typeof obj.playabilityStatus === "object") {
      const ps = obj.playabilityStatus;
      const reason = String(ps.reason || "").toLowerCase();
      const status = String(ps.status || "").toUpperCase();
      const messagesStr = ps.messages ? JSON.stringify(ps.messages).toLowerCase() : "";
      if (
        status !== "OK" &&
        (reason.includes("ad blocker") ||
         reason.includes("adblock") ||
         reason.includes("interruption") ||
         reason.includes("terms of service") ||
         messagesStr.includes("ad blocker") ||
         messagesStr.includes("adblock") ||
         messagesStr.includes("interruption"))
      ) {
        ps.status = "OK";
        delete ps.reason;
        delete ps.errorScreen;
        delete ps.messages;
      }
    }
    if (obj.auxiliaryUi && typeof obj.auxiliaryUi === "object") {
      const auxStr = JSON.stringify(obj.auxiliaryUi).toLowerCase();
      if (auxStr.includes("ad blocker") || auxStr.includes("interruption")) {
        delete obj.auxiliaryUi;
      }
    }
    if (obj.messages && Array.isArray(obj.messages)) {
      obj.messages = obj.messages.filter((m) => {
        const mStr = JSON.stringify(m).toLowerCase();
        return !mStr.includes("ad blocker") && !mStr.includes("interruption");
      });
    }

    for (const key of Object.keys(obj)) {
      if (SAFE_AD_PREFIXED_KEYS.has(key)) continue;

      if (AD_KEY_SET.has(key)) {
        try {
          delete obj[key];
        } catch (e) {}
        continue;
      }

      const v = obj[key];
      if (v && typeof v === "object") {
        stripAds(v, depth + 1);
      }
    }
    return obj;
  }

  function looksLikePlayerResponse(obj) {
    if (!obj || typeof obj !== "object") return false;
    // SPA navigations return arrays like [{ playerResponse: {...} }]
    if (Array.isArray(obj)) return obj.some(looksLikePlayerResponse);
    return !!(
      obj.adPlacements ||
      obj.playerAds ||
      obj.adSlots ||
      obj.videoDetails ||
      obj.streamingData ||
      obj.instreamAdPlayerResponse ||
      obj.playerResponse // main wrapper object holding the player data
    );
  }

  // YouTube endpoints whose JSON can carry ad data (player, next, browse, Shorts, playlists, watch).
  const YT_DATA_URL = /\/youtubei\/v1\/(player|next|browse|search|reel\/)|\/get_midroll|\/get_watch|\/playlist\?list=|\/watch\?[tv]=|[?&]pbj=1/;
  function isYtDataUrl(url) {
    return YT_DATA_URL.test(url);
  }

  // 1) Initial embed: YouTube sets `window.ytInitialPlayerResponse` and `window.ytInitialData`
  let _ytInitialPlayerResponse =
    window.ytInitialPlayerResponse && typeof window.ytInitialPlayerResponse === "object"
      ? stripAds(window.ytInitialPlayerResponse, 0)
      : undefined;
  try {
    Object.defineProperty(window, "ytInitialPlayerResponse", {
      configurable: true,
      get() {
        return _ytInitialPlayerResponse;
      },
      set(value) {
        _ytInitialPlayerResponse = stripAds(value, 0);
      },
    });
  } catch (e) {}

  let _ytInitialData =
    window.ytInitialData && typeof window.ytInitialData === "object"
      ? stripAds(window.ytInitialData, 0)
      : undefined;
  try {
    Object.defineProperty(window, "ytInitialData", {
      configurable: true,
      get() {
        return _ytInitialData;
      },
      set(value) {
        _ytInitialData = stripAds(value, 0);
      },
    });
  } catch (e) {}

  // Hooks below are Proxies (not replacement functions) so that Function.prototype.toString()
  // still reports "[native code]" — plain wrapper functions reveal themselves to page scripts
  // that check whether fetch / JSON.parse / XHR were tampered with.

  // 2) SPA navigations fetch player response via JSON.parse
  const origParse = JSON.parse;
  JSON.parse = new Proxy(origParse, {
    apply(target, thisArg, args) {
      const result = Reflect.apply(target, thisArg, args);
      try {
        if (hasAdMarker(args[0]) && looksLikePlayerResponse(result)) {
          stripAds(result, 0);
        }
      } catch (e) {}
      return result;
    },
  });

  // 3) fetch()-based retrieval of player / next / browse / ad endpoints.
  // The original Response is patched in place (no clone -> no doubled body buffering),
  // and the body is only parsed/walked when it actually contains ad markers.
  const origFetch = window.fetch;
  if (origFetch) {
    const protoText = Response.prototype.text;
    window.fetch = new Proxy(origFetch, {
      apply(target, thisArg, args) {
        try {
          const rawArg = args[0];
          const url = String(rawArg && rawArg.url ? rawArg.url : (rawArg && rawArg.href ? rawArg.href : rawArg || ""));

          // 1) Instantly return clean 204 No Content for ad stats and tracking endpoints.
          // YouTube expects 204 or 200. Returning 204 here avoids network transmission,
          // prevents network error drops (ERR_BLOCKED_BY_CLIENT), and stops YouTube from detecting ad blocking.
          if (
            url.includes("/api/stats/ads") ||
            url.includes("/api/stats/atr") ||
            url.includes("/ptracking") ||
            url.includes("/pagead/") ||
            url.includes("doubleclick.net")
          ) {
            return Promise.resolve(new Response("", { status: 204, statusText: "No Content" }));
          }

          // 2) Instantly return clean empty ad breaks for adbreak / midroll endpoints.
          if (url.includes("/youtubei/v1/player/ad_break") || url.includes("/get_midroll_info")) {
            return Promise.resolve(
              new Response(JSON.stringify({ playerAds: [], adSlots: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }

          if (isYtDataUrl(url)) {
            const promise = Reflect.apply(target, thisArg, args);
            return promise.then((response) => {
              try {
                response.json = async function () {
                  const text = await protoText.call(response);
                  const data = origParse(text);
                  return hasAdMarker(text) || looksLikePlayerResponse(data) ? stripAds(data, 0) : data;
                };
                response.text = async function () {
                  const text = await protoText.call(response);
                  if (!hasAdMarker(text)) return text;
                  try {
                    return JSON.stringify(stripAds(origParse(text), 0));
                  } catch (e) {
                    return text;
                  }
                };
              } catch (err) {}
              return response;
            });
          }
        } catch (e) {}
        return Reflect.apply(target, thisArg, args);
      },
    });
  }

  // 3b) navigator.sendBeacon proxy — safely absorb ad statistics beacons
  if (navigator.sendBeacon) {
    const origSendBeacon = navigator.sendBeacon;
    navigator.sendBeacon = new Proxy(origSendBeacon, {
      apply(target, thisArg, args) {
        try {
          const url = String(args[0] || "");
          if (
            url.includes("/api/stats/ads") ||
            url.includes("/api/stats/atr") ||
            url.includes("/ptracking") ||
            url.includes("/pagead/")
          ) {
            return true;
          }
        } catch (e) {}
        return Reflect.apply(target, thisArg, args);
      },
    });
  }

  // 4) XHR-based retrieval — handle both text and json response types correctly
  const OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    OrigXHR.prototype.open = new Proxy(OrigXHR.prototype.open, {
      apply(target, thisArg, args) {
        try {
          const url = args[1];
          const urlStr = String(url && url.href ? url.href : url || "");
          thisArg.__isPlayerRequest = isYtDataUrl(urlStr);
          thisArg.__isAdStatsRequest =
            urlStr.includes("/api/stats/ads") ||
            urlStr.includes("/api/stats/atr") ||
            urlStr.includes("/ptracking") ||
            urlStr.includes("/pagead/");
          thisArg.__isAdBreakRequest =
            urlStr.includes("/youtubei/v1/player/ad_break") ||
            urlStr.includes("/get_midroll_info");
        } catch (e) {}
        return Reflect.apply(target, thisArg, args);
      },
    });

    OrigXHR.prototype.send = new Proxy(OrigXHR.prototype.send, {
      apply(target, thisArg, args) {
        if (thisArg.__isAdStatsRequest || thisArg.__isAdBreakRequest) {
          setTimeout(() => {
            try {
              const isStats = thisArg.__isAdStatsRequest;
              const status = isStats ? 204 : 200;
              const statusText = isStats ? "No Content" : "OK";
              const dataStr = isStats ? "" : JSON.stringify({ playerAds: [], adSlots: [] });
              Object.defineProperty(thisArg, "readyState", { value: 4, configurable: true });
              Object.defineProperty(thisArg, "status", { value: status, configurable: true });
              Object.defineProperty(thisArg, "statusText", { value: statusText, configurable: true });
              Object.defineProperty(thisArg, "responseText", { value: dataStr, configurable: true });
              Object.defineProperty(thisArg, "response", {
                value: thisArg.responseType === "json" ? (isStats ? null : { playerAds: [], adSlots: [] }) : dataStr,
                configurable: true,
              });
              thisArg.dispatchEvent(new Event("readystatechange"));
              thisArg.dispatchEvent(new Event("load"));
              thisArg.dispatchEvent(new Event("loadend"));
            } catch (e) {}
          }, 0);
          return;
        }

        if (thisArg.__isPlayerRequest) {
          thisArg.addEventListener("readystatechange", function () {
            if (this.readyState === 4) {
              try {
                let data = null;
                const isJsonResponse = this.responseType === "json";

                if (isJsonResponse) {
                  data = this.response;
                } else if (this.responseType === "" || this.responseType === "text") {
                  if (this.responseText && hasAdMarker(this.responseText)) {
                    data = origParse(this.responseText);
                  }
                }

                if (data && typeof data === "object") {
                  stripAds(data, 0);

                  if (isJsonResponse) {
                    Object.defineProperty(this, "response", { value: data, configurable: true });
                  } else {
                    const stringified = JSON.stringify(data);
                    Object.defineProperty(this, "responseText", { value: stringified, configurable: true });
                    Object.defineProperty(this, "response", { value: stringified, configurable: true });
                  }
                }
              } catch (e) {}
            }
          });
        }
        return Reflect.apply(target, thisArg, args);
      },
    });
  }

  // 5) MAIN-world player API helper: skip ads, dismiss enforcement, and resume video playback
  function checkMainWorldPlayerSkip() {
    try {
      const player = document.getElementById("movie_player");
      if (player) {
        if (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting")) {
          if (typeof player.skipAd === "function") {
            player.skipAd();
          }
        }
      }

      // Check if anti-adblock or "Experiencing interruptions" dialog/toast is present in DOM
      const enforcements = document.querySelectorAll(
        "ytd-enforcement-message-view-model, yt-playability-error-supported-renderers, yt-notification-action-renderer, tp-yt-paper-toast, .toast-button"
      );
      for (const el of enforcements) {
        const text = (el.textContent || "").toLowerCase();
        if (
          text.includes("interruption") ||
          text.includes("ad blocker") ||
          text.includes("adblock") ||
          text.includes("find out why") ||
          text.includes("disable your ad blocker")
        ) {
          const dismiss = el.querySelector("#dismiss-button, button.yt-spec-button-shape-next, button, .toast-button");
          if (dismiss) {
            try { dismiss.click(); } catch (e) {}
          }
          const popup = el.closest("ytd-popup-container") || el;
          popup.remove();
          document.querySelectorAll("tp-yt-iron-overlay-backdrop").forEach((b) => b.remove());
          document.documentElement.classList.remove("no-scroll");
          if (document.body) document.body.classList.remove("no-scroll");

          if (player && typeof player.playVideo === "function") {
            player.playVideo();
          }
        }
      }
    } catch (e) {}
  }
  setInterval(checkMainWorldPlayerSkip, 300);
})();
