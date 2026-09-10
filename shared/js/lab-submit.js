/* ============================================================
   lab-submit.js — the one piece of plumbing every experiment
   shares: a common envelope and a single POST to the site's
   Apps Script endpoint.

   An experiment page sets window.EXPERIMENT before loading this
   file, then calls:

     VirtualLab.submit({
       student: { name, register, batch, date, partner },
       summary: { "we' (cm-1)": 869.7, … },   // one row of the sheet
       data:    { … anything, stored as JSON },
       report:  [ {type:"heading", text}, {type:"paragraph", text},
                  {type:"table", caption, rows:[[…],[…]]} ]
     }, messageElement);

   "summary" becomes the columns of that experiment's sheet, so
   keep its keys short, stable and identical between submissions.
   ============================================================ */

(function (root) {
  "use strict";

  var CFG = root.VLAB_CONFIG || {};
  /* read at call time: an experiment built from a spec sets this once the
     spec has been fetched, which is after this file loads */
  function exp() { return root.EXPERIMENT || {}; }

  function envelope(payload) {
    var EXP = exp();
    return {
      schema: 1,
      submittedAt: new Date().toISOString(),
      experiment: {
        id: EXP.id || "unknown",
        title: EXP.title || document.title,
        number: EXP.number || null,
        programme: EXP.programme || "",
        course: EXP.course || "",
        subject: EXP.subject || ""
      },
      site: {
        institution: CFG.INSTITUTION || "",
        department: CFG.DEPARTMENT || ""
      },
      student: payload.student || {},
      summary: payload.summary || {},
      data: payload.data || {},
      report: payload.report || []
    };
  }

  function submit(payload, msgEl) {
    var url = CFG.APPS_SCRIPT_URL;
    function say(t) { if (msgEl) msgEl.textContent = t; }

    if (!url) { say("Online submission is not configured for this site."); return Promise.resolve(false); }
    var s = payload.student || {};
    if (!s.name || !s.register) {
      say("Add your name and register number before submitting.");
      return Promise.resolve(false);
    }
    say("Sending…");
    return fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(envelope(payload))
    }).then(function () {
      say("Sent at " + new Date().toLocaleTimeString() + ". Keep a downloaded copy as well.");
      return true;
    }).catch(function () {
      say("Could not reach the submission address. Download the report and send it to your instructor.");
      return false;
    });
  }

  function configured() { return !!CFG.APPS_SCRIPT_URL; }

  /* ---------- one submission per candidate ----------
     A register number is finished with an experiment once it has been
     submitted. The mark below is only what this browser knows; the
     real guard is in the sheet, which files a second attempt on a
     separate tab instead of overwriting the first. */

  function seal(id, register) { return "vlab.submitted." + id + "." + String(register || "").trim(); }

  function markSubmitted(id, register) {
    try { localStorage.setItem(seal(id, register), new Date().toISOString()); } catch (e) {}
  }
  function submittedAt(id, register) {
    try { return localStorage.getItem(seal(id, register)); } catch (e) { return null; }
  }

  /* Ask the sheet whether this register number has already submitted.
     Resolves null when there is no endpoint or it cannot be reached —
     the caller then falls back to what this browser remembers. */
  function checkSubmitted(id, register) {
    if (!CFG.APPS_SCRIPT_URL || !register) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var cb = "vlabsub" + Date.now();
      var timer = setTimeout(function () { cleanup(); resolve(null); }, 8000);
      function cleanup() {
        clearTimeout(timer);
        delete root[cb];
        if (tag.parentNode) tag.parentNode.removeChild(tag);
      }
      root[cb] = function (res) { cleanup(); resolve(res && res.ok ? !!res.submitted : null); };
      var tag = document.createElement("script");
      tag.src = CFG.APPS_SCRIPT_URL + "?action=submitted&experiment=" + encodeURIComponent(id) +
        "&register=" + encodeURIComponent(register) + "&callback=" + cb;
      tag.onerror = function () { cleanup(); resolve(null); };
      document.head.appendChild(tag);
    });
  }

  /* ---------- where this experiment is filed ----------
     Programme, course and subject are editable in the admin console, so the
     page asks for them rather than trusting what is written in its own
     meta.js. If there is no endpoint, or it cannot be reached, the built-in
     values stand and nothing waits on the network. */

  function applyMeta(onDone) {
    var EXP = exp();
    if (!CFG.APPS_SCRIPT_URL || !EXP.id) { if (onDone) onDone(false); return; }
    var cb = "vlabmeta" + Date.now();
    var timer = setTimeout(function () { cleanup(); if (onDone) onDone(false); }, 8000);
    function cleanup() {
      clearTimeout(timer);
      delete root[cb];
      if (tag.parentNode) tag.parentNode.removeChild(tag);
    }
    root[cb] = function (res) {
      cleanup();
      var m = res && res.ok && res.meta;
      if (!m) { if (onDone) onDone(false); return; }
      ["title", "programme", "course", "subject", "duration"].forEach(function (k) {
        if (m[k]) EXP[k] = m[k];
      });
      if (m.number != null && m.number !== "") EXP.number = m.number;
      if (onDone) onDone(true);
    };
    var tag = document.createElement("script");
    tag.src = CFG.APPS_SCRIPT_URL + "?action=meta&id=" + encodeURIComponent(EXP.id) + "&callback=" + cb;
    tag.onerror = function () { cleanup(); if (onDone) onDone(false); };
    document.head.appendChild(tag);
  }

  /* Shared page furniture: the bar across the top of every
     experiment, with a way back to the list. */
  function masthead(el, opts) {
    if (!el) return;
    opts = opts || {};
    var EXP = exp();
    el.innerHTML =
      '<a class="home" href="' + (CFG.HOME || "../../index.html") + '">← All experiments</a>' +
      '<h1>' + (EXP.title || "") + '</h1>' +
      '<span class="sub">' + (EXP.course || "") +
      (EXP.number ? ", experiment " + EXP.number : "") + '</span>' +
      '<span class="who" id="' + (opts.whoId || "whoami") + '"></span>';
  }

  root.VirtualLab = {
    config: CFG,
    get experiment() { return exp(); },
    envelope: envelope,
    submit: submit,
    configured: configured,
    applyMeta: applyMeta,
    markSubmitted: markSubmitted,
    submittedAt: submittedAt,
    checkSubmitted: checkSubmitted,
    masthead: masthead
  };

})(window);
