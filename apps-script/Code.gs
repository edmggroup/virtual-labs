/**
 * Virtual laboratory — one submission endpoint for every experiment.
 *
 * Each experiment posts the same envelope (see shared/js/lab-submit.js):
 *
 *   { experiment: {id, title, number, programme, course, subject},
 *     student:    {name, register, batch, date, partner},
 *     summary:    { "column name": value, … },
 *     data:       { … kept as JSON … },
 *     report:     [ {type:"heading"|"paragraph"|"table", …}, … ] }
 *
 * The script files each submission on a tab named after the experiment,
 * building that tab's columns from the keys of "summary" the first time
 * it sees them, and adding any new key as a new column later. So a new
 * experiment needs no changes here at all.
 *
 * Deploy as: Web app, execute as "Me", access "Anyone".
 * Put the /exec URL into shared/js/config.js once, for the whole site.
 */

var SETTINGS = {
  MASTER_SHEET: 'All submissions',
  CREATE_DOC: true,                    // a formatted record in Drive per submission
  DOC_FOLDER: 'Virtual lab reports',   // created on first use
  NOTIFY: '',                          // instructor email, or '' for no mail

  /* Set this to a long phrase of your own before you deploy. The admin page
     asks for it, and nothing on the roster can be read or changed without it.
     Student submissions do not need it. */
  ADMIN_KEY: 'change-me',

  /* Reject submissions whose register number is not on the roster.
     Leave false until the roster is loaded. */
  ROSTER_ONLY: false
};

var ROSTER = {
  BATCHES: 'Batches',
  STUDENTS: 'Students',
  ASSIGNMENTS: 'Assignments',
  EXPERIMENTS: 'Experiments'
};
var BATCH_HEADERS = ['Batch', 'Programme', 'Course', 'Semester', 'Notes'];
var STUDENT_HEADERS = ['Register', 'Name', 'Batch', 'Group', 'Email', 'Active'];
var ASSIGN_HEADERS = ['Batch', 'Experiment', 'Mode', 'Opens', 'Due', 'Notes'];
var EXPERIMENT_HEADERS = ['Id', 'Title', 'Programme', 'Semester', 'Course', 'Subject',
  'Number', 'Duration', 'Summary', 'Status', 'Updated', 'Spec'];

var BASE_HEADERS = ['Timestamp', 'Name', 'Register', 'Batch', 'Exp. date', 'Partner'];
var TAIL_HEADERS = ['Report', 'Raw JSON'];

/* ---------- endpoints ---------- */

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.kind === 'admin') return json(adminAction(d));

    var exp = d.experiment || {};
    var stu = d.student || {};

    // if a roster exists, fill in the batch and group from it
    var known = findStudent(stu.register);
    if (known) {
      stu.batch = stu.batch || known.Batch;
      stu.group = known.Group;
      d.student = stu;
    } else if (SETTINGS.ROSTER_ONLY) {
      return json({ ok: false, error: 'That register number is not on the roster.' });
    }

    var url = SETTINGS.CREATE_DOC ? createDoc(d) : '';

    record(sheetFor(exp), d, url);
    logMaster(d, url);
    if (SETTINGS.NOTIFY) notify(d, url);

    return json({ ok: true, experiment: exp.id || '' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/**
 * Reading API. Called from the admin page as JSONP, because a static site
 * cannot read a normal Apps Script reply.
 *
 *   ?action=ping
 *   ?action=roster&key=…            batches, students, assignments
 *   ?action=submissions&key=…&experiment=…&limit=…
 *   ?action=enrolled&register=…     no key: does this register number exist
 */
function doGet(e) {
  var q = (e && e.parameter) || {};
  var out;
  try {
    switch (q.action) {
      case 'roster': out = needKey(q) || { ok: true, roster: readRoster() }; break;
      case 'submissions': out = needKey(q) || { ok: true, submissions: readSubmissions(q) }; break;
      case 'enrolled': out = { ok: true, enrolled: findStudent(q.register) ? true : false }; break;
      case 'catalog': out = { ok: true, experiments: publishedExperiments() }; break;
      case 'spec': out = specFor(q.id); break;
      case 'ping':
      default:
        out = { ok: true, service: 'virtual-lab', tabs: tabCounts(), rosterOnly: SETTINGS.ROSTER_ONLY };
    }
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  if (q.callback) {
    return ContentService.createTextOutput(q.callback + '(' + JSON.stringify(out) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json(out);
}

function needKey(q) {
  if (String(q.key || '') === String(SETTINGS.ADMIN_KEY) && SETTINGS.ADMIN_KEY !== 'change-me') return null;
  if (SETTINGS.ADMIN_KEY === 'change-me') return { ok: false, error: 'Set ADMIN_KEY in the script before using the admin page.' };
  return { ok: false, error: 'Wrong admin key.' };
}

function tabCounts() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets().map(function (sh) {
    return { name: sh.getName(), rows: Math.max(0, sh.getLastRow() - 1) };
  });
}

/* ---------- roster ---------- */

function tab(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}

function readTab(name, headers) {
  var sh = tab(name, headers);
  if (sh.getLastRow() < 2) return [];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();
  return values.filter(function (r) { return String(r[0]).trim() !== ''; }).map(function (r) {
    var o = {};
    headers.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

function readRoster() {
  return {
    batches: readTab(ROSTER.BATCHES, BATCH_HEADERS),
    students: readTab(ROSTER.STUDENTS, STUDENT_HEADERS),
    assignments: readTab(ROSTER.ASSIGNMENTS, ASSIGN_HEADERS)
  };
}

function findStudent(register) {
  register = String(register || '').trim();
  if (!register) return null;
  var rows = readTab(ROSTER.STUDENTS, STUDENT_HEADERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].Register).trim() === register) return rows[i];
  }
  return null;
}

function readSubmissions(q) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(q.experiment || SETTINGS.MASTER_SHEET);
  if (!sh || sh.getLastRow() < 2) return { headers: [], rows: [] };
  var limit = Math.min(parseInt(q.limit || '200', 10) || 200, 500);
  var first = Math.max(2, sh.getLastRow() - limit + 1);
  var cols = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, cols).getValues()[0];
  var rows = sh.getRange(first, 1, sh.getLastRow() - first + 1, cols).getValues();
  var drop = headers.indexOf('Raw JSON');
  if (drop >= 0) {
    headers = headers.filter(function (h, i) { return i !== drop; });
    rows = rows.map(function (r) { return r.filter(function (c, i) { return i !== drop; }); });
  }
  return {
    headers: headers,
    rows: rows.map(function (r) { return r.map(function (c) { return c instanceof Date ? c.toISOString() : c; }); })
  };
}

/* ---------- experiments written in the admin console ----------
   These live in the sheet rather than in the repository, so a new
   experiment can be published without touching the site.        */

function experimentRows() {
  return readTab(ROSTER.EXPERIMENTS, EXPERIMENT_HEADERS);
}

/** The card the portal shows. The spec itself is not sent — it can be long. */
function publishedExperiments() {
  return experimentRows()
    .filter(function (r) { return String(r.Status).toLowerCase() === 'live'; })
    .map(function (r) {
      return {
        id: String(r.Id), title: String(r.Title), programme: String(r.Programme),
        semester: String(r.Semester), course: String(r.Course), subject: String(r.Subject),
        number: r.Number === '' ? null : Number(r.Number), duration: String(r.Duration),
        summary: String(r.Summary), thumb: null, status: 'live'
      };
    });
}

/** The full description an experiment page needs. Public: students open it. */
function specFor(id) {
  var rows = experimentRows();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].Id).trim() === String(id || '').trim()) {
      if (String(rows[i].Status).toLowerCase() !== 'live') {
        return { ok: false, error: 'That experiment has not been published yet.' };
      }
      try {
        return { ok: true, spec: JSON.parse(rows[i].Spec) };
      } catch (err) {
        return { ok: false, error: 'The stored description is not readable: ' + err };
      }
    }
  }
  return { ok: false, error: 'No experiment with that name.' };
}

/* ---------- writing from the admin page ---------- */

function adminAction(d) {
  if (String(d.key || '') !== String(SETTINGS.ADMIN_KEY) || SETTINGS.ADMIN_KEY === 'change-me') {
    return { ok: false, error: 'Wrong admin key.' };
  }
  var p = d.payload || {};
  switch (d.action) {
    case 'saveBatch':
      upsert(ROSTER.BATCHES, BATCH_HEADERS, 'Batch', [p.batch, p.programme, p.course, p.semester, p.notes]);
      return { ok: true };
    case 'deleteBatch':
      removeRow(ROSTER.BATCHES, BATCH_HEADERS, 'Batch', p.batch);
      return { ok: true };
    case 'saveStudents':
      (p.students || []).forEach(function (s) {
        upsert(ROSTER.STUDENTS, STUDENT_HEADERS, 'Register',
          [s.register, s.name, s.batch, s.group, s.email, s.active === false ? 'no' : 'yes']);
      });
      return { ok: true, count: (p.students || []).length };
    case 'deleteStudent':
      removeRow(ROSTER.STUDENTS, STUDENT_HEADERS, 'Register', p.register);
      return { ok: true };
    case 'saveAssignment':
      upsert(ROSTER.ASSIGNMENTS, ASSIGN_HEADERS, 'Batch',
        [p.batch, p.experiment, p.mode, p.opens, p.due, p.notes], p.experiment);
      return { ok: true };
    case 'deleteAssignment':
      removeRow(ROSTER.ASSIGNMENTS, ASSIGN_HEADERS, 'Batch', p.batch, p.experiment);
      return { ok: true };
    case 'saveExperiment': {
      var spec = p.spec;
      if (typeof spec === 'string') spec = JSON.parse(spec);      // fails loudly on bad JSON
      if (!spec || !spec.id) return { ok: false, error: 'The description needs an id.' };
      if (!/^[a-z0-9-]+$/.test(spec.id)) return { ok: false, error: 'The id may use lower-case letters, numbers and hyphens only.' };
      upsert(ROSTER.EXPERIMENTS, EXPERIMENT_HEADERS, 'Id', [
        spec.id, spec.title || '', spec.programme || '', spec.semester || '', spec.course || '',
        spec.subject || '', spec.number == null ? '' : spec.number, spec.duration || '',
        spec.summary || '', p.status || 'draft', new Date(), JSON.stringify(spec)
      ]);
      return { ok: true, id: spec.id };
    }
    case 'publishExperiment':
      setCell(ROSTER.EXPERIMENTS, EXPERIMENT_HEADERS, p.id, 'Status', p.status || 'live');
      return { ok: true };
    case 'deleteExperiment':
      removeRow(ROSTER.EXPERIMENTS, EXPERIMENT_HEADERS, 'Id', p.id);
      return { ok: true };
    case 'listExperiments':
      return { ok: true, experiments: experimentRows() };
    default:
      return { ok: false, error: 'Unknown action ' + d.action };
  }
}

/** Insert or replace a row, matched on its first column (and optionally the second). */
function upsert(name, headers, keyCol, values, secondKey) {
  var sh = tab(name, headers);
  var key = String(values[0]).trim();
  if (!key) throw new Error('A ' + keyCol + ' is required.');
  var rows = sh.getLastRow() - 1;
  if (rows > 0) {
    var data = sh.getRange(2, 1, rows, headers.length).getValues();
    for (var i = 0; i < data.length; i++) {
      var same = String(data[i][0]).trim() === key &&
        (secondKey === undefined || String(data[i][1]).trim() === String(secondKey).trim());
      if (same) {
        sh.getRange(i + 2, 1, 1, headers.length).setValues([pad(values, headers.length)]);
        return;
      }
    }
  }
  sh.appendRow(pad(values, headers.length));
}

function removeRow(name, headers, keyCol, key, secondKey) {
  var sh = tab(name, headers);
  var rows = sh.getLastRow() - 1;
  if (rows < 1) return;
  var data = sh.getRange(2, 1, rows, headers.length).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    var same = String(data[i][0]).trim() === String(key).trim() &&
      (secondKey === undefined || String(data[i][1]).trim() === String(secondKey).trim());
    if (same) sh.deleteRow(i + 2);
  }
}

function setCell(name, headers, key, column, value) {
  var sh = tab(name, headers);
  var rows = sh.getLastRow() - 1;
  if (rows < 1) return;
  var col = headers.indexOf(column) + 1;
  var data = sh.getRange(2, 1, rows, headers.length).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(key).trim()) {
      sh.getRange(i + 2, col).setValue(value);
      return;
    }
  }
}

function pad(values, n) {
  var out = values.slice(0, n);
  while (out.length < n) out.push('');
  return out.map(function (v) { return v === undefined || v === null ? '' : v; });
}

/* ---------- one tab per experiment ---------- */

function tabName(exp) {
  var n = (exp.id || 'unknown').replace(/[\[\]\*\/\\\?:]/g, '-');
  return n.substring(0, 90);
}

function sheetFor(exp) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = tabName(exp);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(BASE_HEADERS.concat(TAIL_HEADERS));
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  }
  return sh;
}

function headers(sh) {
  return sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
}

/** Add a column for any summary key the tab has not seen before. */
function ensureColumns(sh, keys) {
  var head = headers(sh);
  var missing = keys.filter(function (k) { return head.indexOf(k) < 0; });
  if (!missing.length) return head;
  sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  return head.concat(missing);
}

function record(sh, d, docUrl) {
  var stu = d.student || {}, sum = d.summary || {};
  var head = ensureColumns(sh, Object.keys(sum));
  var byName = {
    'Timestamp': new Date(),
    'Name': stu.name || '',
    'Register': stu.register || '',
    'Batch': stu.batch || '',
    'Exp. date': stu.date || '',
    'Partner': stu.partner || '',
    'Report': docUrl || '',
    'Raw JSON': JSON.stringify(d)
  };
  Object.keys(sum).forEach(function (k) { byName[k] = sum[k]; });
  sh.appendRow(head.map(function (h) { return byName[h] === undefined ? '' : byName[h]; }));
}

function logMaster(d, docUrl) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SETTINGS.MASTER_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SETTINGS.MASTER_SHEET, 0);
    sh.appendRow(['Timestamp', 'Experiment', 'Title', 'Course', 'Programme', 'Name', 'Register', 'Batch', 'Report']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 9).setFontWeight('bold');
  }
  var e = d.experiment || {}, s = d.student || {};
  sh.appendRow([new Date(), e.id || '', e.title || '', e.course || '', e.programme || '',
    s.name || '', s.register || '', s.batch || '', docUrl || '']);
  return sh;
}

/* ---------- the student's document ---------- */

function createDoc(d) {
  var e = d.experiment || {}, s = d.student || {};
  var doc = DocumentApp.create((e.id || 'experiment') + ' — ' + (s.register || 'x') + ' ' + (s.name || ''));
  var b = doc.getBody();

  b.appendParagraph(e.title || 'Laboratory record').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  b.appendParagraph([e.course, e.number ? 'experiment ' + e.number : '', (d.site || {}).department]
    .filter(String).join('  ·  '));
  b.appendParagraph([s.name, s.register, s.batch, s.date].filter(String).join('  ·  '));

  (d.report || []).forEach(function (blk) {
    if (blk.type === 'heading') {
      b.appendParagraph(blk.text).setHeading(blk.level === 3
        ? DocumentApp.ParagraphHeading.HEADING3 : DocumentApp.ParagraphHeading.HEADING2);
    } else if (blk.type === 'paragraph') {
      b.appendParagraph(blk.text || '');
    } else if (blk.type === 'table' && blk.rows && blk.rows.length) {
      if (blk.caption) b.appendParagraph(blk.caption).setItalic(true);
      var rows = blk.rows.map(function (r) { return r.map(function (c) { return String(c); }); });
      var t = b.appendTable(rows);
      t.setBorderWidth(0.5);
      var head = t.getRow(0);
      for (var i = 0; i < head.getNumCells(); i++) head.getCell(i).setBackgroundColor('#eef1ec');
    }
  });

  if (d.summary && Object.keys(d.summary).length) {
    b.appendParagraph('Summary').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    var rows2 = [['Quantity', 'Value']];
    Object.keys(d.summary).forEach(function (k) { rows2.push([k, String(d.summary[k])]); });
    b.appendTable(rows2).setBorderWidth(0.5);
  }

  doc.saveAndClose();
  var file = DriveApp.getFileById(doc.getId());
  folder(e).addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  return doc.getUrl();
}

/** Reports go into "Virtual lab reports / <experiment id>". */
function folder(exp) {
  var root = byName(DriveApp, SETTINGS.DOC_FOLDER);
  return byName(root, tabName(exp || {}));
}
function byName(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function notify(d, url) {
  var e = d.experiment || {}, s = d.student || {};
  MailApp.sendEmail(SETTINGS.NOTIFY,
    'Lab submission — ' + (e.id || '') + ' — ' + (s.register || '') + ' ' + (s.name || ''),
    [e.title || '', '', 'Name: ' + (s.name || ''), 'Register: ' + (s.register || ''),
      'Batch: ' + (s.batch || ''), 'Course: ' + (e.course || ''),
      url ? '' : null, url ? 'Report: ' + url : null].filter(function (x) { return x !== null; }).join('\n'));
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to create the master tab and grant permissions. */
function setUp() {
  var sh = logMaster({ experiment: { id: 'setup', title: 'Setup check' }, student: {} }, '');
  sh.deleteRow(sh.getLastRow());
  tab(ROSTER.BATCHES, BATCH_HEADERS);
  tab(ROSTER.STUDENTS, STUDENT_HEADERS);
  tab(ROSTER.ASSIGNMENTS, ASSIGN_HEADERS);
  tab(ROSTER.EXPERIMENTS, EXPERIMENT_HEADERS);
  if (SETTINGS.ADMIN_KEY === 'change-me') {
    Logger.log('Set ADMIN_KEY to a phrase of your own before deploying.');
  }
  Logger.log('Ready. Deploy → New deployment → Web app → execute as me, access anyone.');
}
