// antiadblock.js — runs in the PAGE's own JS context (MAIN world), before
// page scripts, so ad-detection scripts see what they expect, Google IMA video
// player integrations gracefully skip ads without crashing, and popunder
// ads never get a window to open in.

(function () {
  // YouTube does not use third-party detector libraries or the IMA SDK. Faking them there
  // only adds unusual globals (window.google.ima, BlockAdBlock, ...) that YouTube's own
  // ad-blocker detection can notice, so those shims are skipped on YouTube.
  const IS_YOUTUBE = /(^|\.)(youtube|youtube-nocookie|youtubekids)\.com$/.test(location.hostname);

  try {
    // 1) Stub the AdSense queue as an Array so both Array.isArray(window.adsbygoogle)
    // and `window.adsbygoogle.push` calls used for ad-blocker detection don't throw
    // and don't reveal blocking.
    const adsbygoogleStub = [];
    adsbygoogleStub.loaded = true;
    adsbygoogleStub.push = function (...args) {
      return this.length;
    };
    Object.defineProperty(window, "adsbygoogle", {
      get() {
        return adsbygoogleStub;
      },
      set(val) {
        if (Array.isArray(val)) {
          val.loaded = true;
        }
      },
      configurable: true,
    });
  } catch (e) {}

  try {
    // 2) Common ad-blocker-detector globals some sites check for.
    window.canRunAds = true;
    window.google_ad_status = 1;
    window.__adBlockDetected = false;
  } catch (e) {}

  if (!IS_YOUTUBE) try {
    // 2b) Widely-used third-party "is adblock running?" detector libraries.
    const noopDetector = function () {
      const api = {
        onDetected() { return api; },
        onNotDetected(cb) {
          if (typeof cb === "function") setTimeout(cb, 0);
          return api;
        },
        check() { return api; },
        setOption() { return api; },
      };
      return api;
    };
    window.BlockAdBlock = noopDetector;
    window.FuckAdBlock = noopDetector;
    window.fuckAdBlock = noopDetector();
    window.sniffAdBlock = function () {};
    window.adblockDetector = {
      init() {},
      isDetected: false,
    };
  } catch (e) {}

  if (!IS_YOUTUBE) try {
    // 3) Google IMA SDK shim — ensures video players (VideoJS IMA, JWPlayer, etc.)
    // do not crash when imasdk.googleapis.com is blocked by network rules.
    // Instead of freezing with a black screen, players immediately receive
    // "no ads / resume content" events and begin playing the user's video.
    if (!window.google) window.google = {};
    if (!window.google.ima) {
      class MockEventEmitter {
        constructor() {
          this._listeners = {};
        }
        addEventListener(type, cb) {
          if (!this._listeners[type]) this._listeners[type] = [];
          this._listeners[type].push(cb);
        }
        removeEventListener(type, cb) {
          if (!this._listeners[type]) return;
          this._listeners[type] = this._listeners[type].filter((f) => f !== cb);
        }
        _trigger(type, evtObj) {
          const cbs = this._listeners[type] || [];
          for (const cb of cbs) {
            try { cb(evtObj || {}); } catch (e) {}
          }
        }
      }

      class MockAdsManager extends MockEventEmitter {
        init() {}
        start() {
          // Immediately inform video player to resume main content
          setTimeout(() => {
            this._trigger("contentResumeRequested");
            this._trigger("allAdsCompleted");
          }, 0);
        }
        stop() {}
        destroy() {}
        pause() {}
        resume() {}
        resize() {}
        getVolume() { return 1; }
        setVolume() {}
        getCuePoints() { return []; }
        getAdSkippableState() { return false; }
        isCustomClickTrackingUsed() { return false; }
        discardAdBreak() {}
        getCurrentAd() { return null; }
        collapse() {}
      }

      class MockAdsLoader extends MockEventEmitter {
        constructor(adDisplayContainer) {
          super();
          this.container = adDisplayContainer;
        }
        requestAds(request) {
          setTimeout(() => {
            const manager = new MockAdsManager();
            this._trigger("adsManagerLoaded", {
              getAdsManager: () => manager,
              getUserRequestContext: () => request && request.userRequestContext,
            });
          }, 0);
        }
        contentComplete() {}
        destroy() {}
      }

      class MockAdDisplayContainer {
        constructor(container, video) {
          this.container = container;
          this.video = video;
        }
        initialize() {}
        destroy() {}
      }

      window.google.ima = {
        AdDisplayContainer: MockAdDisplayContainer,
        AdsLoader: MockAdsLoader,
        AdsManager: MockAdsManager,
        AdsRenderingSettings: function () {},
        AdsRequest: function () {
          this.adTagUrl = "";
        },
        ImaSdkSettings: function () {},
        settings: {
          setVpaidMode() {},
          setLocale() {},
          setAutoPlayAdBreaks() {},
          setDisableCustomPlaybackForIOS10Plus() {},
          setPlayerType() {},
          setPlayerVersion() {},
        },
        ViewMode: {
          NORMAL: "normal",
          FULLSCREEN: "fullscreen",
        },
        AdEvent: {
          Type: {
            ALL_ADS_COMPLETED: "allAdsCompleted",
            COMPLETE: "complete",
            CONTENT_PAUSE_REQUESTED: "contentPauseRequested",
            CONTENT_RESUME_REQUESTED: "contentResumeRequested",
            STARTED: "started",
            LOADED: "loaded",
            PAUSED: "paused",
            RESUMED: "resumed",
            FIRST_QUARTILE: "firstQuartile",
            MIDPOINT: "midpoint",
            THIRD_QUARTILE: "thirdQuartile",
            SKIPPED: "skipped",
          },
        },
        AdErrorEvent: {
          Type: {
            AD_ERROR: "adError",
          },
        },
        AdsManagerLoadedEvent: {
          Type: {
            ADS_MANAGER_LOADED: "adsManagerLoaded",
          },
        },
      };
    }
  } catch (e) {}

  try {
    // 4) Neutralize popunder/popup ads: block window.open() calls that
    // happen without user gesture or target known popunder ad networks.
    const nativeOpen = window.open;
    let lastUserGesture = 0;
    ["click", "mousedown", "touchstart", "pointerdown"].forEach((evt) => {
      document.addEventListener(
        evt,
        () => {
          lastUserGesture = Date.now();
        },
        true
      );
    });

    window.open = function (...args) {
      const withinGesture = Date.now() - lastUserGesture < 2500;
      let urlStr = "";
      const rawUrl = args[0];
      if (typeof rawUrl === "string") {
        urlStr = rawUrl;
      } else if (rawUrl && typeof rawUrl === "object" && rawUrl.href) {
        urlStr = String(rawUrl.href);
      }
      const looksLikeAd =
        urlStr.length > 0 &&
        /doubleclick|googlesyndication|popads|propellerads|adsterra|exoclick|popcash|adnxs|bet365|1xbet/i.test(
          urlStr
        );
      if (looksLikeAd) {
        return null; // silently swallow the ad popup/popunder
      }
      if (location.hostname.includes("youtube.com")) {
        const isAdShowing = document.querySelector(".ad-showing, .ad-interrupting, [class*='ytp-ad-']");
        if (isAdShowing) {
          return null; // block any advertiser tab from opening during YouTube ads
        }
      }
      if (!withinGesture && urlStr) {
        return null; // block unprompted background popups
      }
      return nativeOpen.apply(window, args);
    };
  } catch (e) {}
})();
