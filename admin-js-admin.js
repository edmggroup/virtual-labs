/* ============================================================
   admin.js — the instructor's side of the site.

   The site is static, so everything here talks to the same Apps
   Script deployment the experiments submit to: reads come back
   as JSONP (a static page cannot read a normal Apps Script
   reply), writes go out as a plain POST. Both need the admin key
   set in the script; it is kept in this tab only and never
   written to disk.
   ============================================================ */

(function (root) {
  "use strict";

  var CFG = root.VLAB_CONFIG || {};
  var CAT = (root.LAB_CATALOG || {}).experiments || [];

  var state = {
    url: CFG.APPS_SCRIPT_URL || "",
    key: "",
    roster: { batches: [], students: [], assignments: [] },
    sheetExperiments: [],
    submissions: null,
    filterBatch: "",
    experiment: "",
    connected: false,
    draft: null            // catalog entry being written
  };

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }
  function toast(msg, kind) {
    var t = el("toast");
    t.textContent = msg;
    t.className = "note " + (kind || "");
    t.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.display = "none"; }, 4500);
  }

  /* ---------- session memory for the key ---------- */

  function remember(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); }
    catch (e) { return null; }
  }

  /* ---------- talking to the script ---------- */

  var jsonpSeq = 0;
  function jsonp(params) {
    return new Promise(function (resolve, reject) {
      if (!state.url) { reject(new Error("No endpoint address set.")); return; }
      var cb = "vlabcb" + (++jsonpSeq) + "_" + Date.now();
      var timer = setTimeout(function () { cleanup(); reject(new Error("The script did not answer.")); }, 15000);
      function cleanup() {
        clearTimeout(timer);
        delete root[cb];
        if (tag.parentNode) tag.parentNode.removeChild(tag);
      }
      root[cb] = function (data) { cleanup(); resolve(data); };
      var q = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      }).join("&");
      var tag = document.createElement("script");
      tag.src = state.url + "?callback=" + cb + "&" + q;
      tag.onerror = function () { cleanup(); reject(new Error("Could not reach the endpoint.")); };
      document.head.appendChild(tag);
    });
  }

  function post(action, payload) {
    if (!state.url) return Promise.reject(new Error("No endpoint address set."));
    return fetch(state.url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ kind: "admin", key: state.key, action: action, payload: payload })
    }).then(function () {
      /* no-cors means the reply is unreadable, so confirm by reading back */
      return new Promise(function (r) { setTimeout(r, 1400); });
    }).then(loadRoster);
  }

  function connect() {
    return jsonp({ action: "ping" }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || "The endpoint answered oddly.");
      state.connected = true;
      el("connState").textContent = "connected";
      return loadRoster();
    });
  }

  function loadRoster() {
    if (!state.key) return Promise.resolve();
    return jsonp({ action: "roster", key: state.key }).then(function (res) {
      if (!res.ok) { toast(res.error, "bad"); return; }
      state.roster = res.roster;
      render();
      return loadSheetExperiments();
    });
  }

  /* the Experiments tab, rows and all, so the console can show what is set */
  function loadSheetExperiments() {
    if (!state.key) return Promise.resolve();
    return jsonp({ action: "roster", key: state.key }).then(function () {
      return new Promise(function (resolve) {
        var cb = "vlabexp" + Date.now();
        var timer = setTimeout(function () { cleanup(); resolve(); }, 12000);
        function cleanup() {
          clearTimeout(timer);
          delete root[cb];
          if (tag.parentNode) tag.parentNode.removeChild(tag);
        }
        root[cb] = function (res) {
          cleanup();
          if (res && res.ok && res.experiments) state.sheetExperiments = res.experiments;
          render();
          resolve();
        };
        var tag = document.createElement("script");
        tag.src = state.url + "?action=catalogRows&key=" + encodeURIComponent(state.key) + "&callback=" + cb;
        tag.onerror = function () { cleanup(); resolve(); };
        document.head.appendChild(tag);
      });
    });
  }

  function loadSubmissions() {
    return jsonp({ action: "submissions", key: state.key, experiment: state.experiment || "", limit: 300 })
      .then(function (res) {
        if (!res.ok) { toast(res.error, "bad"); return; }
        state.submissions = res.submissions;
        render();
      });
  }

  /* ---------- panels ---------- */

  var PANELS = [
    { id: "connect", group: "Setup", title: "Connection", render: panelConnect },
    { id: "batches", group: "People", title: "Batches", render: panelBatches },
    { id: "students", group: "People", title: "Students", render: panelStudents },
    { id: "assign", group: "Teaching", title: "Assignments", render: panelAssign },
    { id: "subs", group: "Teaching", title: "Submissions", render: panelSubs },
    { id: "filing", group: "Site", title: "Programme, course, subject", render: panelFiling },
    { id: "builder", group: "Site", title: "Experiment builder", render: panelBuilder },
    { id: "catalog", group: "Site", title: "Catalog entry", render: panelCatalog }
  ];
  var panel = 0;

  function panelConnect() {
    return '<h2>Connection</h2>' +
      '<p>Everything on this page is stored in the Google Sheet behind your Apps Script deployment. ' +
      'The admin key is the phrase you set as <code>ADMIN_KEY</code> in the script. It is held in this browser tab only — ' +
      'close the tab and it is gone.</p>' +
      '<div class="card">' +
      '<label class="field"><span>Endpoint (/exec URL)</span><input id="fUrl" value="' + esc(state.url) + '"></label>' +
      '<label class="field"><span>Admin key</span><input id="fKey" type="password" value="' + esc(state.key) + '" autocomplete="off"></label>' +
      '<div class="recordbar">' +
      '<button class="primary" data-action="connect">Connect</button>' +
      '<span class="progress" id="connMsg">' + (state.connected ? "Connected." : "") + '</span>' +
      '</div></div>' +
      (state.connected ? '<div class="note">Connected. The roster holds ' + state.roster.batches.length + ' batch(es), ' +
        state.roster.students.length + ' student(s) and ' + state.roster.assignments.length + ' assignment(s).</div>' : '') +
      '<div class="note warn">If the endpoint is left empty in <code>shared/js/config.js</code>, students cannot submit and this page has nothing to talk to.</div>';
  }

  function panelBatches() {
    if (!guard()) return guardMsg("batches");
    var rows = state.roster.batches.map(function (b) {
      return "<tr><td>" + esc(b.Batch) + "</td><td>" + esc(b.Programme) + "</td><td>" + esc(b.Course) +
        "</td><td>" + esc(b.Semester) + "</td><td>" +
        state.roster.students.filter(function (s) { return String(s.Batch) === String(b.Batch); }).length + "</td>" +
        '<td><button class="link" data-action="delBatch" data-b="' + esc(b.Batch) + '">remove</button></td></tr>';
    }).join("");

    var programmes = uniq(CAT.map(function (x) { return x.programme; }));
    var courses = uniq(CAT.map(function (x) { return x.course; }));

    return "<h2>Batches</h2>" +
      "<p>A batch is the group you teach together — a section, a lab batch, a year. Students belong to one, assignments are made to one, and submissions are filed against it.</p>" +
      '<div class="tablewrap"><table><caption>Batches on the roster</caption>' +
      '<thead><tr><th>Batch</th><th>Programme</th><th>Course</th><th>Semester</th><th class="num">Students</th><th></th></tr></thead>' +
      "<tbody>" + (rows || '<tr class="pending"><td colspan="6">None yet.</td></tr>') + "</tbody></table></div>" +
      '<div class="card"><h3>Add or update a batch</h3>' +
      '<div class="grid2">' +
      '<div>' + input("bBatch", "Batch name", "e.g. MSc-Phy-III-A") +
      datalistInput("bProgramme", "Programme", programmes) + "</div>" +
      "<div>" + datalistInput("bCourse", "Course", courses) +
      input("bSemester", "Semester", "e.g. Semester III") + "</div>" +
      "</div>" +
      input("bNotes", "Notes", "optional") +
      '<button class="primary" data-action="saveBatch">Save the batch</button></div>';
  }

  function panelStudents() {
    if (!guard()) return guardMsg("students");
    var batches = state.roster.batches.map(function (b) { return b.Batch; });
    var list = state.roster.students.filter(function (s) {
      return !state.filterBatch || String(s.Batch) === state.filterBatch;
    });
    var rows = list.map(function (s) {
      return "<tr><td>" + esc(s.Register) + "</td><td>" + esc(s.Name) + "</td><td>" + esc(s.Batch) +
        "</td><td>" + esc(s.Group) + "</td><td>" + esc(s.Email) + "</td>" +
        '<td><button class="link" data-action="delStudent" data-r="' + esc(s.Register) + '">remove</button></td></tr>';
    }).join("");

    return "<h2>Students</h2>" +
      "<p>The register number is the key: it is what a student types into an experiment, what their plate is generated from, and what their submissions are filed under. Groups are for pairing students at one bench.</p>" +
      '<div class="recordbar" style="margin-bottom:12px"><label class="toggle">Batch ' +
      select("fFilterBatch", [""].concat(batches), state.filterBatch, "all batches") + "</label>" +
      '<span class="progress">' + list.length + " student(s)</span></div>" +
      '<div class="tablewrap"><table><caption>Students on the roster</caption>' +
      "<thead><tr><th>Register</th><th>Name</th><th>Batch</th><th>Group</th><th>Email</th><th></th></tr></thead>" +
      "<tbody>" + (rows || '<tr class="pending"><td colspan="6">None yet.</td></tr>') + "</tbody></table></div>" +

      '<div class="card"><h3>Add one student</h3><div class="grid2"><div>' +
      input("sRegister", "Register number", "") + input("sName", "Name", "") + "</div><div>" +
      '<label class="field"><span>Batch</span>' + select("sBatch", batches, state.filterBatch) + "</label>" +
      input("sGroup", "Group", "optional") + input("sEmail", "Email", "optional") + "</div></div>" +
      '<button class="primary" data-action="saveStudent">Add the student</button></div>' +

      '<div class="card"><h3>Paste a list</h3>' +
      "<p>One student per line, comma separated: <code>register, name, group, email</code>. The group and email may be left off. Existing register numbers are updated rather than duplicated.</p>" +
      '<label class="field"><span>Batch for this list</span>' + select("bulkBatch", batches, state.filterBatch) + "</label>" +
      '<label class="field"><span>Rows</span><textarea id="bulkRows" style="min-height:120px" placeholder="2447101, Anita Rao, G1&#10;2447102, Suresh Kumar, G1"></textarea></label>' +
      '<button class="primary" data-action="bulkStudents">Add them all</button></div>';
  }

  function panelAssign() {
    if (!guard()) return guardMsg("assignments");
    var batches = state.roster.batches.map(function (b) { return b.Batch; });
    var live = CAT.filter(function (x) { return x.status !== "planned"; });
    var base = location.href.replace(/admin\/.*$/, "");

    var rows = state.roster.assignments.map(function (a) {
      var exp = live.filter(function (x) { return x.id === String(a.Experiment); })[0];
      var link = base + (exp && exp.engine === "spec"
        ? "experiments/_generic/?id=" + encodeURIComponent(a.Experiment)
        : "experiments/" + a.Experiment + "/");
      return "<tr><td>" + esc(a.Batch) + "</td><td>" + esc(exp ? exp.title : a.Experiment) + "</td>" +
        "<td>" + esc(fmtDate(a.Due)) + "</td>" +
        '<td><a href="' + esc(link) + '" target="_blank" rel="noopener">open</a> · ' +
        '<button class="link" data-action="copyLink" data-l="' + esc(link) + '">copy link</button> · ' +
        '<button class="link" data-action="delAssign" data-b="' + esc(a.Batch) + '" data-e="' + esc(a.Experiment) + '">remove</button></td></tr>';
    }).join("");

    return "<h2>Assignments</h2>" +
      "<p>Set which experiment a batch is doing, and hand out the link. A register number may submit an experiment once; a second attempt is filed on the <em>Repeat attempts</em> tab rather than replacing the first.</p>" +
      '<div class="tablewrap"><table><caption>Current assignments</caption>' +
      "<thead><tr><th>Batch</th><th>Experiment</th><th>Due</th><th>Link</th></tr></thead>" +
      "<tbody>" + (rows || '<tr class="pending"><td colspan="4">None yet.</td></tr>') + "</tbody></table></div>" +
      '<div class="card"><h3>Assign an experiment</h3><div class="grid2"><div>' +
      '<label class="field"><span>Batch</span>' + select("aBatch", batches) + "</label>" +
      '<label class="field"><span>Experiment</span>' +
      '<select id="aExperiment">' + live.map(function (x) {
        return '<option value="' + esc(x.id) + '">' + esc(x.title) + "</option>";
      }).join("") + "</select></label></div><div>" +
      '<label class="field"><span>Mode</span><select id="aMode"><option value="practice">practice</option><option value="assessed">assessed</option></select></label>' +
      input("aDue", "Due date", "", "date") + "</div></div>" +
      '<button class="primary" data-action="saveAssign">Save the assignment</button></div>';
  }

  function panelSubs() {
    if (!guard()) return guardMsg("submissions");
    var live = CAT.filter(function (x) { return x.status !== "planned"; });
    var head = '<h2>Submissions</h2>' +
      '<p>Read straight from the sheet. Choose an experiment for its own tab, or leave it on the master log to see everything.</p>' +
      '<div class="recordbar" style="margin-bottom:12px">' +
      '<label class="toggle">Experiment <select id="sExp">' +
      '<option value="">All submissions (master log)</option>' +
      live.map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (state.experiment === x.id ? " selected" : "") + ">" + esc(x.title) + "</option>";
      }).join("") + "</select></label>" +
      '<button class="ghost" data-action="loadSubs">Load</button>' +
      (state.submissions && state.submissions.rows.length ? '<button class="ghost" data-action="subsCsv">Download as CSV</button>' : "") +
      "</div>";

    if (!state.submissions) return head + '<div class="note">Nothing loaded yet.</div>';
    var s = state.submissions;
    if (!s.rows.length) return head + '<div class="note warn">That tab has no submissions yet.</div>';

    var missing = "";
    if (state.experiment) {
      var got = {};
      var regCol = s.headers.indexOf("Register");
      if (regCol >= 0) {
        s.rows.forEach(function (r) { got[String(r[regCol]).trim()] = true; });
        var due = state.roster.assignments.filter(function (a) { return String(a.Experiment) === state.experiment; })
          .map(function (a) { return String(a.Batch); });
        var owing = state.roster.students.filter(function (st) {
          return due.indexOf(String(st.Batch)) >= 0 && !got[String(st.Register).trim()];
        });
        if (due.length) {
          missing = owing.length
            ? '<div class="note warn">' + owing.length + " student(s) assigned this experiment have not submitted: " +
              esc(owing.slice(0, 20).map(function (x) { return x.Register; }).join(", ")) +
              (owing.length > 20 ? " …" : "") + "</div>"
            : '<div class="note">Everyone assigned this experiment has submitted.</div>';
        }
      }
    }

    return head + missing + '<div class="tablewrap"><table><caption>' + s.rows.length + " most recent rows</caption><thead><tr>" +
      s.headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      s.rows.slice().reverse().map(function (r) {
        return "<tr>" + r.map(function (c) {
          var v = String(c == null ? "" : c);
          if (/^https?:\/\//.test(v)) return '<td><a href="' + esc(v) + '" target="_blank" rel="noopener">report</a></td>';
          return "<td>" + esc(v.length > 60 ? v.slice(0, 60) + "…" : v) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  function panelCatalog() {
    var d = state.draft || {
      id: "", title: "", number: "", programme: "", semester: "", course: "",
      subject: "", tags: "", duration: "", summary: "", thumb: "", status: "planned"
    };
    var entry = catalogEntry(d);
    return "<h2>Catalog builder</h2>" +
      "<p>The portal reads <code>data/catalog.js</code>. Fill this in, copy the entry, and paste it into that file — or download the whole file with the new entry already in place. Adding an experiment still means adding its folder under <code>experiments/</code>; this only lists it.</p>" +
      '<div class="card"><div class="grid2"><div>' +
      input("cId", "Folder id", "hall-effect", "text", d.id) +
      input("cTitle", "Title", "", "text", d.title) +
      input("cNumber", "Experiment number", "", "number", d.number) +
      input("cProgramme", "Programme", "M.Sc. Physics", "text", d.programme) +
      input("cSemester", "Semester", "Semester I", "text", d.semester) +
      "</div><div>" +
      input("cCourse", "Course", "General Physics Laboratory III", "text", d.course) +
      input("cSubject", "Subject", "Solid state physics", "text", d.subject) +
      input("cTags", "Tags, comma separated", "", "text", d.tags) +
      input("cDuration", "Duration", "2 h", "text", d.duration) +
      input("cThumb", "Thumbnail path", "experiments/hall-effect/docs/apparatus.png", "text", d.thumb) +
      "</div></div>" +
      '<label class="field"><span>Summary</span><textarea id="cSummary">' + esc(d.summary) + "</textarea></label>" +
      '<label class="field"><span>Status</span><select id="cStatus">' +
      ['<option value="planned"' + (d.status === "planned" ? " selected" : "") + ">planned</option>",
        '<option value="live"' + (d.status === "live" ? " selected" : "") + ">live</option>"].join("") +
      "</select></label>" +
      '<div class="recordbar">' +
      '<button class="ghost" data-action="catPreview">Update the entry</button>' +
      '<button class="ghost" data-action="catCopy">Copy the entry</button>' +
      '<button class="primary" data-action="catFile">Download catalog.js with it added</button>' +
      "</div></div>" +
      '<pre class="codeblock" id="catOut">' + esc(entry) + "</pre>";
  }

  /* ============================================================
     Where each experiment is filed. Programme, course and subject
     are held in the sheet, so they can be changed here without
     touching the repository — and both the portal card and the
     experiment's own report header follow.
     ============================================================ */

  var filingId = null;

  /* every experiment the site knows about: listed in catalog.js, published
     from the sheet, or both */
  function allExperiments() {
    var out = [], seen = {};
    CAT.forEach(function (x) {
      seen[x.id] = true;
      out.push({ id: x.id, from: "repository", entry: x });
    });
    (state.sheetExperiments || []).forEach(function (r) {
      var id = String(r.Id);
      if (seen[id]) {
        out.forEach(function (o) { if (o.id === id) { o.from = "repository, re-filed here"; o.row = r; } });
        return;
      }
      out.push({ id: id, from: "written in this console", row: r });
    });
    return out;
  }

  /* what is in force for an experiment: the sheet row wins where it is filled in */
  function filingOf(item) {
    var e = item.entry || {}, r = item.row || {};
    function pick(sheetVal, fileVal) {
      return sheetVal !== undefined && sheetVal !== null && String(sheetVal) !== "" ? sheetVal : (fileVal || "");
    }
    return {
      id: item.id,
      title: pick(r.Title, e.title),
      programme: pick(r.Programme, e.programme),
      semester: pick(r.Semester, e.semester),
      course: pick(r.Course, e.course),
      subject: pick(r.Subject, e.subject),
      number: pick(r.Number, e.number),
      duration: pick(r.Duration, e.duration),
      summary: pick(r.Summary, e.summary),
      engine: pick(r.Engine, e.engine || "coded"),
      overridden: !!item.row
    };
  }

  function panelFiling() {
    if (!guard()) return guardMsg("filing");
    var items = allExperiments();
    if (!filingId && items.length) filingId = items[0].id;
    var chosen = items.filter(function (i) { return i.id === filingId; })[0];
    var f = chosen ? filingOf(chosen) : null;

    var rows = items.map(function (i) {
      var g = filingOf(i);
      return "<tr" + (i.id === filingId ? ' class="hit"' : "") + "><td>" + esc(g.title || i.id) + "</td>" +
        "<td>" + esc(g.programme) + "</td><td>" + esc(g.course) + "</td><td>" + esc(g.subject) + "</td>" +
        "<td>" + esc(g.overridden ? "set here" : "as shipped") + "</td>" +
        '<td><button class="link" data-action="filingPick" data-id="' + esc(i.id) + '">edit</button>' +
        (g.overridden ? ' · <button class="link" data-action="filingClear" data-id="' + esc(i.id) + '">revert</button>' : "") +
        "</td></tr>";
    }).join("");

    var programmes = uniq(items.map(function (i) { return filingOf(i).programme; }));
    var courses = uniq(items.map(function (i) { return filingOf(i).course; }));
    var subjects = uniq(items.map(function (i) { return filingOf(i).subject; }));

    return "<h2>Programme, course, subject</h2>" +
      "<p>Where an experiment is filed decides how the portal groups it and what its report header says. " +
      "Change it here and it takes effect everywhere — no file to edit, no deploy. " +
      "An experiment whose code lives in the repository keeps its own page and its thumbnail; only its filing moves.</p>" +
      '<div class="tablewrap"><table><caption>Every experiment on the site</caption>' +
      "<thead><tr><th>Experiment</th><th>Programme</th><th>Course</th><th>Subject</th><th>Filing</th><th></th></tr></thead>" +
      "<tbody>" + (rows || '<tr class="pending"><td colspan="6">None yet.</td></tr>') + "</tbody></table></div>" +
      (f
        ? '<div class="card"><h3>' + esc(f.title || f.id) + '</h3>' +
          '<div class="grid2"><div>' +
          binp("flTitle", "Title", f.title) +
          datalistInput2("flProgramme", "Programme", programmes, f.programme) +
          datalistInput2("flSemester", "Semester", uniq(items.map(function (i) { return filingOf(i).semester; })), f.semester) +
          binp("flNumber", "Experiment number", f.number, "number") +
          "</div><div>" +
          datalistInput2("flCourse", "Course", courses, f.course) +
          datalistInput2("flSubject", "Subject", subjects, f.subject) +
          binp("flDuration", "Duration", f.duration) +
          "</div></div>" +
          barea("flSummary", "Summary shown on the portal card", f.summary) +
          '<div class="recordbar">' +
          '<button class="primary" data-action="filingSave" data-id="' + esc(f.id) + '" data-engine="' + esc(f.engine) + '">Save the filing</button>' +
          '<span class="progress">Takes effect on the portal and in the report header the next time either is opened.</span>' +
          "</div></div>"
        : "") +
      '<div class="note">The experiment\'s own page still ships with a fallback in <code>js/meta.js</code>, used when this site has no endpoint configured or the sheet cannot be reached.</div>';
  }

  function datalistInput2(id, label, options, value) {
    return '<label class="field"><span>' + esc(label) + '</span>' +
      '<input id="' + id + '" list="' + id + '-list" value="' + esc(value == null ? "" : value) + '">' +
      '<datalist id="' + id + '-list">' + options.filter(Boolean).map(function (o) {
        return '<option value="' + esc(o) + '">';
      }).join("") + "</datalist></label>";
  }

  /* ============================================================
     Experiment builder — describe an experiment for any subject
     and publish it without touching a file. The description is
     stored in the sheet; the generic engine on the site runs it.
     ============================================================ */

  var draftSpec = null;

  function blankSpec() {
    return {
      id: "", title: "", number: null, programme: "", semester: "", course: "", subject: "",
      duration: "", summary: "", aim: "", apparatus: "",
      theory: [], formulae: [], procedure: "",
      constants: [], table: { caption: "Table 1 — observations", rows: 6, columns: [] },
      plot: null, derived: [], results: [], questions: []
    };
  }

  function spec() {
    if (!draftSpec) draftSpec = blankSpec();
    return draftSpec;
  }

  function panelBuilder() {
    var sp = spec();
    return "<h2>Experiment builder</h2>" +
      "<p>Describe the experiment — the observation table, what the student works out, and the formulae behind each quantity — and it becomes a working experiment on the site. The formulae are used only to <em>check</em> the student: every value is still typed in by hand and marked against their own readings.</p>" +

      '<div class="card"><h3>1. What it is</h3><div class="grid2"><div>' +
      binp("spId", "Folder id (lower case, hyphens)", sp.id) +
      binp("spTitle", "Title", sp.title) +
      binp("spNumber", "Experiment number", sp.number == null ? "" : sp.number, "number") +
      binp("spProgramme", "Programme", sp.programme) +
      "</div><div>" +
      binp("spSemester", "Semester", sp.semester) +
      binp("spCourse", "Course", sp.course) +
      binp("spSubject", "Subject", sp.subject) +
      binp("spDuration", "Duration", sp.duration) +
      "</div></div>" +
      barea("spSummary", "One or two sentences for the portal card", sp.summary) +
      "</div>" +

      '<div class="card"><h3>2. What the student reads first</h3>' +
      barea("spAim", "Aim", sp.aim) +
      barea("spApparatus", "Apparatus", sp.apparatus) +
      barea("spTheory", "Theory — one paragraph per line", (sp.theory || []).join("\n")) +
      barea("spFormulae", "Formulae to display — one per line", (sp.formulae || []).join("\n")) +
      barea("spProcedure", "Procedure note shown above the table", sp.procedure) +
      "</div>" +

      '<div class="card"><h3>3. Constants</h3>' +
      "<p>One per line: <code>key, label, value, unit</code>. The key is what your formulae will use.</p>" +
      barea("spConstants", "Constants", (sp.constants || []).map(function (c) {
        return [c.key, c.label, c.value, c.unit].join(", ");
      }).join("\n")) + "</div>" +

      '<div class="card"><h3>4. The observation table</h3>' +
      '<div class="grid2"><div>' + binp("spCaption", "Caption", sp.table.caption) + "</div><div>" +
      binp("spRows", "Number of rows", sp.table.rows, "number") + "</div></div>" +
      "<p>One column per line: <code>key | label | unit | kind | formula-or-source | dp</code>. " +
      "Kind is <code>input</code> (the student sets it), <code>measured</code> (read off a simulated instrument) " +
      "or <code>calc</code> (the student works it out and is checked). " +
      "For <code>measured</code>, give the behaviour as <code>formula ; noise ; offset</code>, " +
      "for example <code>1000*RH*I*B/t ; 0.02 ; 0.11</code>.</p>" +
      barea("spColumns", "Columns", (sp.table.columns || []).map(function (c) {
        var f = c.kind === "measured" && c.source
          ? [c.source.formula, c.source.noise, c.source.offset].filter(function (x) { return x !== undefined; }).join(" ; ")
          : (c.formula || "");
        return [c.key, c.label, c.unit, c.kind, f, c.dp].join(" | ");
      }).join("\n")) + "</div>" +

      '<div class="card"><h3>5. Graph</h3>' +
      "<p>Leave the columns blank for no graph.</p><div class=\"grid2\"><div>" +
      binp("spPlotX", "x column key", sp.plot ? sp.plot.x : "") +
      binp("spPlotY", "y column key", sp.plot ? sp.plot.y : "") +
      "</div><div>" +
      binp("spPlotXL", "x axis label", sp.plot ? sp.plot.xlabel : "") +
      binp("spPlotYL", "y axis label", sp.plot ? sp.plot.ylabel : "") +
      "</div></div></div>" +

      '<div class="card"><h3>6. What the student works out</h3>' +
      "<p>One per line: <code>key | label | formula | unit | dp | expected value</code>. " +
      "The expected value is optional and only appears in the result table. " +
      "Formulae may use constants, column keys, other keys defined above them, and " +
      "<code>mean sum min max count slope intercept r2 sqrt abs ln log exp sin cos tan</code>.</p>" +
      barea("spDerived", "Intermediate quantities", (sp.derived || []).map(function (d) {
        return [d.key, d.label, d.formula, d.unit, d.dp].join(" | ");
      }).join("\n")) +
      barea("spResults", "Final results", (sp.results || []).map(function (d) {
        return [d.key, d.label, d.formula, d.unit, d.dp, d.literature].join(" | ");
      }).join("\n")) + "</div>" +

      '<div class="card"><h3>7. Questions</h3>' +
      barea("spQuestions", "One per line", (sp.questions || []).join("\n")) + "</div>" +

      '<div class="recordbar">' +
      '<button class="ghost" data-action="specCheck">Check the description</button>' +
      '<button class="primary" data-action="specSave">Save as a draft</button>' +
      '<button class="primary" data-action="specPublish">Publish</button>' +
      '<button class="ghost" data-action="specJson">Download the JSON</button>' +
      '<button class="ghost" data-action="specLoad">Load one from the sheet</button>' +
      '<span class="progress" id="specMsg"></span></div>' +
      '<div id="specReport"></div>';
  }

  function binp(id, label, value, type) {
    return '<label class="field"><span>' + esc(label) + '</span><input id="' + id + '" type="' + (type || "text") +
      '" value="' + esc(value == null ? "" : value) + '"></label>';
  }
  function barea(id, label, value) {
    return '<label class="field"><span>' + esc(label) + '</span><textarea id="' + id + '">' +
      esc(value == null ? "" : value) + "</textarea></label>";
  }
  function lines(id) {
    return val(id).split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
  }

  /** Read the form back into a spec object. */
  function readSpec() {
    var sp = blankSpec();
    sp.id = val("spId").toLowerCase();
    sp.title = val("spTitle");
    sp.number = val("spNumber") === "" ? null : Number(val("spNumber"));
    sp.programme = val("spProgramme");
    sp.semester = val("spSemester");
    sp.course = val("spCourse");
    sp.subject = val("spSubject");
    sp.duration = val("spDuration");
    sp.summary = val("spSummary");
    sp.aim = val("spAim");
    sp.apparatus = val("spApparatus");
    sp.theory = lines("spTheory");
    sp.formulae = lines("spFormulae");
    sp.procedure = val("spProcedure");

    sp.constants = lines("spConstants").map(function (l) {
      var p = l.split(",").map(function (x) { return x.trim(); });
      return { key: p[0], label: p[1] || p[0], value: Number(p[2]), unit: p[3] || "" };
    });

    sp.table.caption = val("spCaption") || "Table 1 — observations";
    sp.table.rows = Number(val("spRows")) || 6;
    sp.table.columns = lines("spColumns").map(function (l) {
      var p = l.split("|").map(function (x) { return x.trim(); });
      var col = { key: p[0], label: p[1] || p[0], unit: p[2] || "", kind: (p[3] || "input").toLowerCase() };
      if (p[5] !== undefined && p[5] !== "") col.dp = Number(p[5]);
      if (col.kind === "measured") {
        var bits = (p[4] || "").split(";").map(function (x) { return x.trim(); });
        col.source = { formula: bits[0] || "", noise: bits[1] === undefined || bits[1] === "" ? 0.01 : Number(bits[1]) };
        if (bits[2] !== undefined && bits[2] !== "") col.source.offset = Number(bits[2]);
      } else if (col.kind === "calc") {
        col.formula = p[4] || "";
      }
      return col;
    });

    var px = val("spPlotX"), py = val("spPlotY");
    sp.plot = px && py ? {
      x: px, y: py,
      xlabel: val("spPlotXL") || px,
      ylabel: val("spPlotYL") || py,
      title: (val("spPlotYL") || py) + " against " + (val("spPlotXL") || px)
    } : null;

    function quantities(id, withLit) {
      return lines(id).map(function (l) {
        var p = l.split("|").map(function (x) { return x.trim(); });
        var q = { key: p[0], label: p[1] || p[0], formula: p[2] || "", unit: p[3] || "" };
        if (p[4] !== undefined && p[4] !== "") q.dp = Number(p[4]);
        if (withLit && p[5] !== undefined && p[5] !== "") q.literature = Number(p[5]);
        return q;
      });
    }
    sp.derived = quantities("spDerived", false);
    sp.results = quantities("spResults", true);
    sp.questions = lines("spQuestions");
    draftSpec = sp;
    return sp;
  }

  /** Everything that would stop this experiment working, said plainly. */
  function checkSpec(sp) {
    var problems = [], notes = [];
    if (!sp.id) problems.push("It needs an id.");
    else if (!/^[a-z0-9-]+$/.test(sp.id)) problems.push("The id may use lower-case letters, numbers and hyphens only.");
    if (!sp.title) problems.push("It needs a title.");
    if (!sp.table.columns.length) problems.push("The observation table has no columns.");

    var known = {};
    (sp.constants || []).forEach(function (c) {
      if (!c.key) problems.push("A constant has no key.");
      if (!isFinite(c.value)) problems.push("The constant " + (c.key || "?") + " has no numeric value.");
      known[c.key] = true;
    });
    sp.table.columns.forEach(function (c) {
      if (!c.key) problems.push("A column has no key.");
      known[c.key] = true;
      if (["input", "measured", "calc"].indexOf(c.kind) < 0) problems.push("Column " + c.key + " has an unknown kind '" + c.kind + "'.");
    });

    function checkFormula(where, f, allowed) {
      if (!f) { problems.push(where + " has no formula."); return; }
      var v = root.Formula.validate(f);
      if (!v.ok) { problems.push(where + ": " + v.error); return; }
      v.names.forEach(function (n) {
        if (!allowed[n] && n !== "pi" && n !== "e") {
          problems.push(where + " uses '" + n + "', which is not a constant, a column or a quantity defined before it.");
        }
      });
    }

    sp.table.columns.forEach(function (c) {
      if (c.kind === "calc") checkFormula("Column " + c.key, c.formula, known);
      if (c.kind === "measured") checkFormula("Column " + c.key + " (instrument)", c.source && c.source.formula, known);
    });

    var running = {};
    Object.keys(known).forEach(function (k) { running[k] = true; });
    (sp.derived || []).concat(sp.results || []).forEach(function (d) {
      if (!d.key) problems.push("A quantity has no key.");
      checkFormula((d.label || d.key), d.formula, running);
      running[d.key] = true;
    });

    if (sp.plot) {
      if (!known[sp.plot.x]) problems.push("The graph's x column '" + sp.plot.x + "' is not in the table.");
      if (!known[sp.plot.y]) problems.push("The graph's y column '" + sp.plot.y + "' is not in the table.");
    }
    if (!sp.table.columns.some(function (c) { return c.kind === "measured"; })) {
      notes.push("No column is read from an instrument, so students will type every reading themselves. That is right for a paper exercise, and wrong for a simulated one.");
    }
    if (!(sp.results || []).length) notes.push("No final result is defined, so the result page will be empty.");
    if (!(sp.questions || []).length) notes.push("No questions are set.");

    return { problems: problems, notes: notes };
  }

  function showCheck(res) {
    var host = el("specReport");
    if (!host) return;
    host.innerHTML =
      (res.problems.length
        ? '<div class="note bad"><strong>' + res.problems.length + " problem" + (res.problems.length === 1 ? "" : "s") +
          " to fix:</strong><ul><li>" + res.problems.map(esc).join("</li><li>") + "</li></ul></div>"
        : '<div class="note">The description holds together. Every formula parses and every name it uses is defined.</div>') +
      (res.notes.length ? '<div class="note warn"><ul><li>' + res.notes.map(esc).join("</li><li>") + "</li></ul></div>" : "");
  }

  /* ---------- little helpers ---------- */

  function guard() { return state.connected && state.key; }
  function guardMsg(what) {
    return "<h2>" + what.charAt(0).toUpperCase() + what.slice(1) + "</h2>" +
      '<div class="note warn">Connect first, on the Connection panel, before the ' + what + " can be read or changed.</div>";
  }
  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out.sort();
  }
  function input(id, label, placeholder, type, value) {
    return '<label class="field"><span>' + esc(label) + '</span><input id="' + id + '" type="' + (type || "text") +
      '" placeholder="' + esc(placeholder || "") + '" value="' + esc(value === undefined ? "" : value) + '"></label>';
  }
  function datalistInput(id, label, options) {
    return '<label class="field"><span>' + esc(label) + '</span><input id="' + id + '" list="' + id + '-list">' +
      '<datalist id="' + id + '-list">' + options.map(function (o) { return '<option value="' + esc(o) + '">'; }).join("") +
      "</datalist></label>";
  }
  function select(id, options, chosen, blankLabel) {
    return '<select id="' + id + '">' + options.map(function (o) {
      return '<option value="' + esc(o) + '"' + (String(chosen) === String(o) ? " selected" : "") + ">" +
        esc(o === "" ? (blankLabel || "—") : o) + "</option>";
    }).join("") + "</select>";
  }
  function val(id) { var e = el(id); return e ? e.value.trim() : ""; }
  function fmtDate(d) {
    if (!d) return "";
    var s = String(d);
    return s.length > 10 && s.indexOf("T") > 0 ? s.slice(0, 10) : s;
  }
  function download(name, text, mime) {
    var url = URL.createObjectURL(new Blob([text], { type: mime || "text/plain;charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function catalogEntry(d) {
    var tags = String(d.tags || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    var lines = [
      "    {",
      '      id: "' + d.id + '",',
      '      title: "' + String(d.title).replace(/"/g, "'") + '",',
      "      number: " + (d.number === "" || d.number === null ? "null" : Number(d.number)) + ",",
      '      programme: "' + d.programme + '",',
      '      semester: "' + d.semester + '",',
      '      course: "' + d.course + '",',
      '      subject: "' + d.subject + '",',
      "      tags: [" + tags.map(function (t) { return '"' + t + '"'; }).join(", ") + "],",
      '      duration: "' + d.duration + '",',
      '      summary: "' + String(d.summary).replace(/"/g, "'").replace(/\n/g, " ") + '",',
      "      thumb: " + (d.thumb ? '"' + d.thumb + '"' : "null") + ",",
      '      status: "' + d.status + '"',
      "    }"
    ];
    return lines.join("\n");
  }

  function readDraft() {
    state.draft = {
      id: val("cId"), title: val("cTitle"), number: val("cNumber"), programme: val("cProgramme"),
      semester: val("cSemester"), course: val("cCourse"), subject: val("cSubject"),
      tags: val("cTags"), duration: val("cDuration"), thumb: val("cThumb"),
      summary: val("cSummary"), status: val("cStatus")
    };
    return state.draft;
  }

  function catalogFile() {
    var d = readDraft();
    var entries = CAT.map(function (x) {
      return catalogEntry({
        id: x.id, title: x.title, number: x.number, programme: x.programme, semester: x.semester,
        course: x.course, subject: x.subject, tags: (x.tags || []).join(", "),
        duration: x.duration, thumb: x.thumb, summary: x.summary, status: x.status
      });
    });
    if (d.id) entries.push(catalogEntry(d));
    return "/* Generated by the admin catalog builder. Edit freely. */\n\n" +
      "window.LAB_CATALOG = {\n\n  experiments: [\n\n" + entries.join(",\n\n") + "\n\n  ]\n};\n";
  }

  /* ---------- events ---------- */

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-action]");
    if (!t) return;
    var a = t.dataset.action;

    if (a === "panel") { panel = +t.dataset.i; render(); return; }

    if (a === "connect") {
      state.url = val("fUrl");
      state.key = val("fKey");
      remember("vlab.admin.url", state.url);
      el("connMsg").textContent = "Connecting…";
      connect().then(function () {
        el("connMsg").textContent = "Connected.";
        toast("Connected to the sheet.");
        render();
      }).catch(function (e) {
        state.connected = false;
        el("connState").textContent = "not connected";
        el("connMsg").textContent = e.message;
        toast(e.message, "bad");
      });
      return;
    }

    if (a === "saveBatch") {
      post("saveBatch", {
        batch: val("bBatch"), programme: val("bProgramme"), course: val("bCourse"),
        semester: val("bSemester"), notes: val("bNotes")
      }).then(function () { toast("Batch saved."); }).catch(err);
      return;
    }
    if (a === "delBatch") {
      if (!confirm("Remove the batch " + t.dataset.b + "? Students already on it are left alone.")) return;
      post("deleteBatch", { batch: t.dataset.b }).then(function () { toast("Batch removed."); }).catch(err);
      return;
    }
    if (a === "saveStudent") {
      if (!val("sRegister")) { toast("A register number is needed.", "warn"); return; }
      post("saveStudents", {
        students: [{
          register: val("sRegister"), name: val("sName"), batch: val("sBatch"),
          group: val("sGroup"), email: val("sEmail")
        }]
      }).then(function () { toast("Student saved."); }).catch(err);
      return;
    }
    if (a === "delStudent") {
      if (!confirm("Remove " + t.dataset.r + " from the roster? Their submissions stay.")) return;
      post("deleteStudent", { register: t.dataset.r }).then(function () { toast("Removed."); }).catch(err);
      return;
    }
    if (a === "bulkStudents") {
      var batch = val("bulkBatch");
      var students = val("bulkRows").split(/\n+/).map(function (line) {
        var p = line.split(",").map(function (x) { return x.trim(); });
        if (!p[0]) return null;
        return { register: p[0], name: p[1] || "", batch: batch, group: p[2] || "", email: p[3] || "" };
      }).filter(Boolean);
      if (!students.length) { toast("Nothing to add.", "warn"); return; }
      post("saveStudents", { students: students })
        .then(function () { toast(students.length + " student(s) added."); }).catch(err);
      return;
    }
    if (a === "saveAssign") {
      post("saveAssignment", {
        batch: val("aBatch"), experiment: val("aExperiment"), mode: "",
        due: val("aDue"), opens: "", notes: ""
      }).then(function () { toast("Assignment saved."); }).catch(err);
      return;
    }
    if (a === "delAssign") {
      post("deleteAssignment", { batch: t.dataset.b, experiment: t.dataset.e })
        .then(function () { toast("Assignment removed."); }).catch(err);
      return;
    }
    if (a === "copyLink") {
      copy(t.dataset.l);
      return;
    }
    if (a === "loadSubs") {
      state.experiment = val("sExp");
      loadSubmissions().catch(err);
      return;
    }
    if (a === "subsCsv") {
      var s = state.submissions;
      var csv = [s.headers].concat(s.rows).map(function (r) {
        return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(",");
      }).join("\n");
      download("submissions-" + (state.experiment || "all") + ".csv", csv, "text/csv;charset=utf-8");
      return;
    }
    if (a === "filingPick") { filingId = t.dataset.id; render(); return; }
    if (a === "filingSave") {
      post("saveClassification", {
        id: t.dataset.id, engine: t.dataset.engine,
        title: val("flTitle"), programme: val("flProgramme"), semester: val("flSemester"),
        course: val("flCourse"), subject: val("flSubject"),
        number: val("flNumber") === "" ? null : Number(val("flNumber")),
        duration: val("flDuration"), summary: val("flSummary")
      }).then(loadSheetExperiments).then(function () { toast("Filing saved."); }).catch(err);
      return;
    }
    if (a === "filingClear") {
      if (!confirm("Revert " + t.dataset.id + " to the details that ship with it?")) return;
      post("deleteExperiment", { id: t.dataset.id })
        .then(loadSheetExperiments).then(function () { toast("Reverted."); }).catch(err);
      return;
    }
    if (a === "specCheck") { showCheck(checkSpec(readSpec())); return; }
    if (a === "specSave" || a === "specPublish") {
      var sp = readSpec();
      var res = checkSpec(sp);
      showCheck(res);
      if (res.problems.length) { toast("Fix the problems listed before saving.", "warn"); return; }
      if (!guard()) { toast("Connect on the Connection panel first.", "warn"); return; }
      post("saveExperiment", { spec: sp, status: a === "specPublish" ? "live" : "draft" })
        .then(function () {
          toast(a === "specPublish"
            ? "Published. It is on the portal now, at experiments/_generic/?id=" + sp.id
            : "Saved as a draft. Publish it when you are ready.");
        }).catch(err);
      return;
    }
    if (a === "specJson") {
      var sj = readSpec();
      download((sj.id || "experiment") + ".spec.json", JSON.stringify(sj, null, 2), "application/json");
      toast("Put this in experiments/" + (sj.id || "…") + "/spec.json to keep it in the repository instead.");
      return;
    }
    if (a === "specLoad") {
      if (!guard()) { toast("Connect first.", "warn"); return; }
      jsonp({ action: "roster", key: state.key }).then(function () {
        var id = prompt("Which experiment id should be loaded?");
        if (!id) return;
        return jsonp({ action: "spec", id: id }).then(function (res) {
          if (!res.ok) { toast(res.error, "bad"); return; }
          draftSpec = res.spec;
          render();
          toast("Loaded " + id + ".");
        });
      }).catch(err);
      return;
    }
    if (a === "catPreview") { readDraft(); render(); return; }
    if (a === "catCopy") { copy(catalogEntry(readDraft())); return; }
    if (a === "catFile") { download("catalog.js", catalogFile(), "text/javascript"); return; }
  });

  document.addEventListener("change", function (ev) {
    if (ev.target.id === "fFilterBatch") { state.filterBatch = ev.target.value; render(); }
  });

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Copied."); },
        function () { toast("Could not copy — select it by hand.", "warn"); });
    } else toast("Copying is not available in this browser; select it by hand.", "warn");
  }

  function err(e) { toast(e.message || "That did not work.", "bad"); }

  /* ---------- render ---------- */

  function render() {
    var groups = [], seen = {};
    PANELS.forEach(function (p) { if (!seen[p.group]) { seen[p.group] = 1; groups.push(p.group); } });
    el("rail").innerHTML = groups.map(function (g) {
      return '<div class="group">' + esc(g) + "</div>" + PANELS.map(function (p, i) {
        return p.group !== g ? "" : '<button data-action="panel" data-i="' + i + '"' +
          (i === panel ? ' aria-current="true"' : "") + '><span class="n">' + (i + 1) + "</span>" + esc(p.title) + "</button>";
      }).join("");
    }).join("");
    el("panel").innerHTML = PANELS[panel].render();
  }

  root.addEventListener("DOMContentLoaded", function () {
    state.url = remember("vlab.admin.url") || state.url;
    render();
  });

})(window);
