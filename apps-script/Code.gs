/**
 * AlO band-spectrum lab — submission endpoint.
 *
 * Deploy as: Web app, execute as "Me", access "Anyone".
 * Copy the /exec URL into js/config.js on the GitHub Pages site.
 *
 * The page posts plain text so the browser sends no CORS preflight;
 * it does not read the reply, so nothing here needs CORS headers.
 */

var SETTINGS = {
  SHEET_NAME: 'Submissions',
  CREATE_DOC: true,              // write a formatted record into Drive
  DOC_FOLDER: 'AlO lab reports', // created on first use
  NOTIFY: ''                     // instructor email, or '' for no mail
};

/* literature values, used for the error columns */
var LIT = { we_u: 870.0, wexe_u: 3.50, we_l: 979.23, wexe_l: 6.97 };

var HEADERS = ['Timestamp', 'Name', 'Register', 'Batch', 'Exp. date', 'Partner',
  'lambda0 (A)', 'C (A cm)', 'd0 (cm)', 'Hg lines', 'Bands',
  "we' (cm-1)", "wexe' (cm-1)", "xe'", 'we" (cm-1)', 'wexe" (cm-1)', 'xe"',
  "err we' (%)", 'err we" (%)', 'Report', 'Raw JSON'];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var row = buildRow(data);
    if (SETTINGS.CREATE_DOC) row[19] = createDoc(data);
    sheet().appendRow(row);
    if (SETTINGS.NOTIFY) notify(data, row[19]);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  var n = Math.max(0, sheet().getLastRow() - 1);
  return HtmlService.createHtmlOutput(
    '<p style="font-family:system-ui">AlO lab endpoint is live. ' + n + ' submission(s) recorded.</p>');
}

/* ---------- sheet ---------- */

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SETTINGS.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SETTINGS.SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function buildRow(d) {
  var s = d.student || {}, h = d.hartmann || {}, r = d.results || {};
  var u = r.upper || {}, l = r.lower || {};
  function err(got, lit) { return isFinite(got) ? round(Math.abs(got - lit) / lit * 100, 2) : ''; }
  return [
    new Date(), s.name || '', s.register || '', s.batch || '', s.date || '', s.partner || '',
    round(h.lam0, 2), round(h.C, 1), round(h.d0, 4),
    (d.mercury || []).length, (d.bands || []).length,
    u.we || '', u.wexe || '', u.xe || '', l.we || '', l.wexe || '', l.xe || '',
    err(u.we, LIT.we_u), err(l.we, LIT.we_l),
    '', JSON.stringify(d)
  ];
}

function round(x, n) {
  return (typeof x === 'number' && isFinite(x)) ? Math.round(x * Math.pow(10, n)) / Math.pow(10, n) : '';
}

/* ---------- per-student document ---------- */

function createDoc(d) {
  var s = d.student || {}, r = d.results || {};
  var name = 'AlO band spectrum — ' + (s.register || 'x') + ' ' + (s.name || '');
  var doc = DocumentApp.create(name);
  var b = doc.getBody();

  b.appendParagraph('Vibrational constants of AlO from its electronic band spectrum')
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  b.appendParagraph([s.name, s.register, s.batch, s.date].filter(String).join('  ·  '));

  b.appendParagraph('Calibration').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  var h = d.hartmann || {};
  b.appendParagraph('Hartmann constants: lambda0 = ' + round(h.lam0, 2) + ' A, C = ' +
    round(h.C, 1) + ' A cm, d0 = ' + round(h.d0, 4) + ' cm');
  var hgRows = [['Standard lambda (A)', 'Comparator reading (cm)']];
  (d.mercury || []).forEach(function (m) { hgRows.push([String(m.lambda), String(m.d)]); });
  style(b.appendTable(hgRows));

  b.appendParagraph('Band heads').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  var bandRows = [["v'", 'v"', 'd (cm)', 'lambda (A)', 'nu (cm-1)']];
  (d.bands || []).forEach(function (x) {
    bandRows.push([String(x.vu), String(x.vl), String(x.d), String(x.lambda), String(x.nu)]);
  });
  style(b.appendTable(bandRows));

  if (r.upper && r.lower) {
    b.appendParagraph('Result').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    style(b.appendTable([
      ['Quantity', 'Measured', 'Literature'],
      ["we' (cm-1)", String(r.upper.we), String(LIT.we_u)],
      ["wexe' (cm-1)", String(r.upper.wexe), String(LIT.wexe_u)],
      ["xe'", String(r.upper.xe), String(round(LIT.wexe_u / LIT.we_u, 5))],
      ['we" (cm-1)', String(r.lower.we), String(LIT.we_l)],
      ['wexe" (cm-1)', String(r.lower.wexe), String(LIT.wexe_l)],
      ['xe"', String(r.lower.xe), String(round(LIT.wexe_l / LIT.we_l, 5))]
    ]));
  }

  var a = d.answers || {};
  var qs = ['What do you mean by an electronic band spectrum?',
    'What do you mean by the vibrational constants of AlO?',
    'Do you expect a band spectrum from a homonuclear diatomic molecule?',
    'Explain sequences and progressions.'];
  b.appendParagraph('Questions').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  ['q1', 'q2', 'q3', 'q4'].forEach(function (k, i) {
    b.appendParagraph((i + 1) + '. ' + qs[i]).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    b.appendParagraph(a[k] || '—');
  });
  if (a.errors) {
    b.appendParagraph('Sources of error').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    b.appendParagraph(a.errors);
  }

  doc.saveAndClose();
  var file = DriveApp.getFileById(doc.getId());
  folder().addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  return doc.getUrl();
}

function style(table) {
  table.setBorderWidth(0.5);
  var head = table.getRow(0);
  for (var i = 0; i < head.getNumCells(); i++) head.getCell(i).setBackgroundColor('#eef1ec');
  return table;
}

function folder() {
  var it = DriveApp.getFoldersByName(SETTINGS.DOC_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(SETTINGS.DOC_FOLDER);
}

function notify(d, url) {
  var s = d.student || {};
  MailApp.sendEmail(SETTINGS.NOTIFY,
    'AlO lab submission — ' + (s.register || '') + ' ' + (s.name || ''),
    'A new record has been submitted.\n\n' +
    'Name: ' + (s.name || '') + '\nRegister: ' + (s.register || '') + '\nBatch: ' + (s.batch || '') +
    '\nBands measured: ' + (d.bands || []).length +
    (url ? '\n\nReport: ' + url : ''));
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Run once from the editor to create the sheet and grant permissions. */
function setUp() {
  sheet();
  Logger.log('Ready. Deploy → New deployment → Web app → execute as me, access anyone.');
}
