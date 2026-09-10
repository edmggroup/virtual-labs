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
    masthead: masthead
  };

})(window);
