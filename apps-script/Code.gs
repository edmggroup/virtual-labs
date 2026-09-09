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
  NOTIFY: ''                           // instructor email, or '' for no mail
};

var BASE_HEADERS = ['Timestamp', 'Name', 'Register', 'Batch', 'Exp. date', 'Partner'];
var TAIL_HEADERS = ['Report', 'Raw JSON'];

/* ---------- endpoints ---------- */

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var exp = d.experiment || {};
    var stu = d.student || {};
    var url = SETTINGS.CREATE_DOC ? createDoc(d) : '';

    record(sheetFor(exp), d, url);
    logMaster(d, url);
    if (SETTINGS.NOTIFY) notify(d, url);

    return json({ ok: true, experiment: exp.id || '' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = ss.getSheets().map(function (sh) {
    return '<li>' + sh.getName() + ' — ' + Math.max(0, sh.getLastRow() - 1) + '</li>';
  }).join('');
  return HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui;padding:12px">' +
    '<p>Virtual laboratory endpoint is live.</p><ul>' + rows + '</ul></div>');
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
  logMaster({ experiment: { id: 'setup', title: 'Setup check' }, student: {} }, '');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS.MASTER_SHEET);
  sh.deleteRow(sh.getLastRow());
  Logger.log('Ready. Deploy → New deployment → Web app → execute as me, access anyone.');
}
