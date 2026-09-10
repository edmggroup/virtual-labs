/* ============================================================
   pwa.js — registers the service worker and offers the install
   prompt. Works from any depth: the site root is worked out from
   this script's own address, so an experiment three folders down
   registers the same worker as the portal.
   ============================================================ */

(function (root) {
  "use strict";

  var me = document.currentScript && document.currentScript.src;
  var base = me ? me.replace(/shared\/js\/pwa\.js.*$/, "") : "./";

  var deferred = null;

  function register() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;      // no worker when opened off a disk
    navigator.serviceWorker.register(base + "sw.js", { scope: base })
      .catch(function (e) { if (root.console) console.info("Offline support unavailable:", e.message); });
  }

  root.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    var b = document.getElementById("installBtn");
    if (b) b.hidden = false;
  });

  function install() {
    if (!deferred) return Promise.resolve(false);
    deferred.prompt();
    return deferred.userChoice.then(function (r) {
      deferred = null;
      var b = document.getElementById("installBtn");
      if (b) b.hidden = true;
      return r.outcome === "accepted";
    });
  }

  document.addEventListener("click", function (ev) {
    if (ev.target && ev.target.id === "installBtn") install();
  });

  root.VLabPWA = { install: install, base: base, canInstall: function () { return !!deferred; } };

  if (document.readyState === "complete") register();
  else root.addEventListener("load", register);

})(window);
