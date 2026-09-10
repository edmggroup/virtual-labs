/* ============================================================
   load.js — finds the experiment this page is meant to run.

   ?id=<experiment id>  is looked up in this order:
     1. experiments/<id>/spec.json   — a spec kept in the repo
     2. the Apps Script endpoint     — a spec written in the
                                       admin console and published
   Specs come back as JSONP, because a static page cannot read a
   normal Apps Script reply.
   ============================================================ */

(function (root) {
  "use strict";

  var CFG = root.VLAB_CONFIG || {};
  var id = (/[?&]id=([^&]+)/.exec(location.search) || [])[1];
  id = id ? decodeURIComponent(id) : "";

  function fail(msg) {
    document.getElementById("steps").innerHTML =
      '<h2>This experiment could not be opened</h2><div class="note bad">' + msg + "</div>" +
      '<p><a href="../../index.html">Back to the list of experiments</a></p>';
  }

  if (!id) { fail("No experiment was named in the address."); return; }
  if (!/^[a-z0-9-]+$/i.test(id)) { fail("That experiment name is not one this site uses."); return; }

  fetch("../" + id + "/spec.json")
    .then(function (r) { if (!r.ok) throw new Error("no file"); return r.json(); })
    .then(run)
    .catch(function () { fromEndpoint(); });

  function fromEndpoint() {
    if (!CFG.APPS_SCRIPT_URL) {
      fail("This experiment is not stored in the repository, and no endpoint is configured to look it up.");
      return;
    }
    var cb = "vlabspec" + Date.now();
    var timer = setTimeout(function () { cleanup(); fail("The endpoint did not answer."); }, 15000);
    function cleanup() { clearTimeout(timer); delete root[cb]; if (tag.parentNode) tag.parentNode.removeChild(tag); }
    root[cb] = function (res) {
      cleanup();
      if (res && res.ok && res.spec) run(res.spec);
      else fail((res && res.error) || "That experiment has not been published.");
    };
    var tag = document.createElement("script");
    tag.src = CFG.APPS_SCRIPT_URL + "?action=spec&id=" + encodeURIComponent(id) + "&callback=" + cb;
    tag.onerror = function () { cleanup(); fail("The endpoint could not be reached."); };
    document.head.appendChild(tag);
  }

  function run(spec) {
    spec.id = spec.id || id;
    try { root.LabEngine.start(spec); }
    catch (e) { fail("The experiment description could not be read: " + e.message); }
  }

})(window);
