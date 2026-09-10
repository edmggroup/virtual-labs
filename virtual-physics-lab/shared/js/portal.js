/* ============================================================
   portal.js — reads data/catalog.js and lists the experiments,
   grouped by course and filtered by programme, subject or text.
   ============================================================ */

(function (root) {
  "use strict";

  var CFG = root.VLAB_CONFIG || {};
  var CAT = (root.LAB_CATALOG || {}).experiments || [];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out.sort();
  }

  var state = { programme: "", subject: "", course: "", q: "" };

  function fill(select, values, allLabel) {
    select.innerHTML = '<option value="">' + allLabel + "</option>" +
      values.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + "</option>"; }).join("");
  }

  function matches(x) {
    if (state.programme && x.programme !== state.programme) return false;
    if (state.subject && x.subject !== state.subject) return false;
    if (state.course && x.course !== state.course) return false;
    if (state.q) {
      var hay = [x.title, x.summary, x.subject, x.course, x.programme, x.semester]
        .concat(x.tags || []).join(" ").toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
    }
    return true;
  }

  function hrefFor(x) {
    return x.engine === "spec"
      ? "experiments/_generic/?id=" + encodeURIComponent(x.id)
      : "experiments/" + x.id + "/";
  }

  function entry(x) {
    var live = x.status !== "planned";
    var href = hrefFor(x);
    var shot = x.thumb
      ? '<span class="shot"><img src="' + esc(x.thumb) + '" alt=""></span>'
      : '<span class="shot blank"></span>';
    var title = live
      ? '<a href="' + esc(href) + '">' + esc(x.title) + "</a>"
      : esc(x.title) + ' <span class="badge">in preparation</span>';
    var line = [x.number ? "Experiment " + x.number : null, x.subject, x.duration]
      .filter(Boolean).join("  ·  ");

    return '<article class="entry' + (live ? "" : " planned") + '">' +
      (live ? '<a href="' + esc(href) + '" aria-hidden="true" tabindex="-1">' + shot + "</a>" : shot) +
      "<div>" +
      '<div class="line">' + esc(line) + "</div>" +
      "<h3>" + title + "</h3>" +
      "<p>" + esc(x.summary || "") + "</p>" +
      (live ? '<div class="actions"><a href="' + esc(href) + '">Open the experiment</a></div>' : "") +
      "</div></article>";
  }

  function render() {
    var list = CAT.filter(matches);
    el("count").textContent = list.length + (list.length === 1 ? " experiment" : " experiments");

    /* filters earn their place once there is something to filter */
    var bar = document.querySelector(".filters");
    if (bar) bar.hidden = CAT.length < 2;

    if (!list.length) {
      el("catalog").innerHTML = '<p class="empty">Nothing matches those filters. Clear the search box, or choose "All" in each list.</p>';
      return;
    }

    // group by course, keeping programme and semester on the heading
    var groups = [], index = {};
    list.forEach(function (x) {
      var key = (x.programme || "") + "|" + (x.course || "Other experiments");
      if (!index[key]) { index[key] = { programme: x.programme, course: x.course, semester: x.semester, items: [] }; groups.push(index[key]); }
      index[key].items.push(x);
    });
    groups.forEach(function (g) {
      g.items.sort(function (a, b) { return (a.number || 99) - (b.number || 99); });
    });

    el("catalog").innerHTML = groups.map(function (g) {
      return '<section class="course-group"><h2>' + esc(g.course || "Other experiments") + "</h2>" +
        '<div class="meta">' + esc([g.programme, g.semester].filter(Boolean).join("  ·  ")) + "</div>" +
        '<div class="entries">' + g.items.map(entry).join("") + "</div></section>";
    }).join("");
  }

  function boot() {
    document.title = (CFG.SITE_TITLE || "Virtual Laboratory") + " — " + (CFG.DEPARTMENT || "");
    el("siteTitle").textContent = CFG.SITE_TITLE || "Virtual Laboratory";
    el("sitePlace").textContent = [CFG.DEPARTMENT, CFG.INSTITUTION].filter(Boolean).join(", ");
    el("siteTagline").textContent = CFG.TAGLINE || "";

    published();
    fill(el("fProgramme"), uniq(CAT.map(function (x) { return x.programme; })), "All programmes");
    fill(el("fCourse"), uniq(CAT.map(function (x) { return x.course; })), "All courses");
    fill(el("fSubject"), uniq(CAT.map(function (x) { return x.subject; })), "All subjects");

    ["fProgramme", "fCourse", "fSubject"].forEach(function (id) {
      el(id).addEventListener("change", function () {
        state[id.slice(1).toLowerCase()] = this.value;
        render();
      });
    });
    el("fSearch").addEventListener("input", function () { state.q = this.value.trim(); render(); });

    render();
  }

  /* Experiments written in the admin console live in the sheet rather than in
     this file. Pull them in if an endpoint is configured; the page works
     perfectly well without them. */
  function published() {
    if (!CFG.APPS_SCRIPT_URL) return;
    var cb = "vlabcat" + Date.now();
    var timer = setTimeout(cleanup, 12000);
    function cleanup() {
      clearTimeout(timer);
      delete root[cb];
      if (tag.parentNode) tag.parentNode.removeChild(tag);
    }
    root[cb] = function (res) {
      cleanup();
      if (!res || !res.ok || !res.experiments) return;
      var byId = {};
      CAT.forEach(function (x) { byId[x.id] = x; });
      res.experiments.forEach(function (x) {
        var have = byId[x.id];
        if (have) {
          /* an experiment listed in this file: the sheet may re-file it, but
             it keeps its own page, its thumbnail and its engine */
          ["title", "programme", "semester", "course", "subject", "duration", "summary"]
            .forEach(function (k) { if (x[k]) have[k] = x[k]; });
          if (x.number != null && x.number !== "") have.number = x.number;
          return;
        }
        if (!x.hasSpec) return;          // an override for something not listed here
        x.engine = "spec";
        x.status = x.status || "live";
        CAT.push(x);
        byId[x.id] = x;
      });
      fill(el("fProgramme"), uniq(CAT.map(function (x) { return x.programme; })), "All programmes");
      fill(el("fCourse"), uniq(CAT.map(function (x) { return x.course; })), "All courses");
      fill(el("fSubject"), uniq(CAT.map(function (x) { return x.subject; })), "All subjects");
      render();
    };
    var tag = document.createElement("script");
    tag.src = CFG.APPS_SCRIPT_URL + "?action=catalog&callback=" + cb;
    tag.onerror = cleanup;
    document.head.appendChild(tag);
  }

  root.addEventListener("DOMContentLoaded", boot);

})(window);
