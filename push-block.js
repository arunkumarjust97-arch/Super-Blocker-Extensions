// push-block.js — runs in the PAGE context at document_start on every site/frame.
//
// Stops the "X wants to show notifications — Allow / Block" spam. Push-spam sites
// call Notification.requestPermission() / PushManager.subscribe() on page load or
// scroll, with no click from you. Those calls are silently answered "denied".
// If YOU click something on a site (e.g. "Enable notifications" in Gmail/Slack),
// the browser reports a real user gesture and the request goes through normally.
(function () {
  const hasGesture = () => {
    try {
      return navigator.userActivation ? navigator.userActivation.isActive : true;
    } catch (e) {
      return true;
    }
  };

  try {
    if (window.Notification && typeof Notification.requestPermission === "function") {
      const origRequest = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = function (callback) {
        if (hasGesture()) return origRequest(callback);
        if (typeof callback === "function") {
          try { callback("denied"); } catch (e) {}
        }
        return Promise.resolve("denied");
      };
    }
  } catch (e) {}

  try {
    if (window.PushManager && PushManager.prototype && PushManager.prototype.subscribe) {
      const origSubscribe = PushManager.prototype.subscribe;
      PushManager.prototype.subscribe = function (...args) {
        if (hasGesture()) return origSubscribe.apply(this, args);
        return Promise.reject(new DOMException("Registration failed - permission denied", "NotAllowedError"));
      };
    }
  } catch (e) {}
})();
