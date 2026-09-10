# Virtual Physics Laboratory

A static site that hosts simulated laboratory experiments, grouped by programme, course and
subject, with one shared submission backend behind all of them.

No build step and no dependencies: it is HTML, CSS and plain JavaScript, so GitHub Pages serves
it as it stands. See [DEPLOY.md](DEPLOY.md) to put it online and
[ADDING-AN-EXPERIMENT.md](ADDING-AN-EXPERIMENT.md) to add the next one.

## What is here

```
index.html                     the portal: filter by programme, course or subject
admin/                         the instructor's console
data/catalog.js                the list of experiments — edit this to add one
shared/css/base.css            design tokens, buttons, tables, forms, print rules
shared/css/portal.css          the front page
shared/js/config.js            site settings, including the one submission address
shared/js/lab-submit.js        the common envelope and the single POST
shared/js/pdf.js               a small PDF writer — no dependencies
shared/js/report-doc.js        one block list → preview, PDF and Google Doc
shared/js/portal.js            filtering and grouping on the front page
shared/js/pwa.js               service-worker registration and the install prompt
shared/js/formula.js           the little expression language specs are written in
shared/js/lab-engine.js        runs an experiment that was described rather than coded
shared/js/plot.js              scatter plot with a fitted line
experiments/_generic/          the page that runs a described experiment
experiments/<id>/              one folder per experiment, self-contained
experiments/_template/         a working skeleton to copy
apps-script/Code.gs            the backend: roster, assignments, submissions
manifest.webmanifest, sw.js    installable, and works offline
tests/site.js                  portal, admin, template and PWA files, in jsdom
.nojekyll                      stops GitHub Pages hiding folders that begin with _
```

Each experiment owns everything under its own folder — its apparatus, its physics, its styles,
its tests, its images. It borrows only three things from the site: the base stylesheet, the
config, and the submission library. Nothing in `shared/` knows what any particular experiment
measures, which is what keeps them independent.

## Experiments

| Experiment | Programme | Course | Subject |
|---|---|---|---|
| [AlO band spectrum](experiments/alo-band-spectrum/) — vibrational constants from the B²Σ⁺ → X²Σ⁺ system | M.Sc. Physics | General Physics Laboratory V | Molecular spectroscopy |
| [Hall coefficient](experiments/_generic/?id=hall-effect) — carrier concentration of a semiconductor, described in a spec rather than coded | M.Sc. Physics | General Physics Laboratory III | Solid state physics |

![The simulated plate](experiments/alo-band-spectrum/docs/plate.png)

## Four things the site guarantees

**The student does the arithmetic.** Experiments are built to check working, not to replace it.
In the AlO experiment the student solves Hartmann's three equations themselves, converts every
wavelength to a wavenumber themselves, and takes every difference themselves; the app marks each
entry ✓ or ✗ against what follows from their *own* earlier figures, and never shows the value it
expected. A wrong entry is flagged along with everything downstream of it, so the error is
traceable rather than mysterious.

**One file leaves the site, and it is a PDF.** No CSV, no HTML, no session files, no separate
image downloads. The record carries the spectrum itself — the plate as the student measured it,
with their own settings marked on it — alongside the readings, the working, the tables and every
graph. It is generated in the browser by `shared/js/pdf.js`, a small base-14 PDF writer with
Greek and superscripts, so ωe′, Σ⁺, Å and ν̃ all set correctly without embedding a font.
`experiments/alo-band-spectrum/docs/sample-report.pdf` is a real one.

**Instructors have a console, and can add experiments from it.** `admin/` manages batches,
students, groups, assignments and submissions — and its experiment builder turns a description
into a working experiment for any subject, with no code and no deploy. You give it the
observation table, a simulated instrument if the reading is not typed, the formulae behind each
quantity, and the questions; it checks every formula and every name before it will publish.
Published experiments live in the sheet and run on the generic engine at `experiments/_generic/`.

**It installs, and it fits.** A manifest and a service worker make the site an app on a phone or
tablet, and everything but submission works with no signal. The layout is fluid rather than
fixed: gutters, rail and type scale with the viewport, the portal runs two experiments abreast on
a wide screen, the step rail becomes a scrolling strip on a phone, and safe-area insets are
respected on notched devices.

## How submission works

Every experiment posts the same envelope, so one Apps Script deployment serves the whole site:

```js
VirtualLab.submit({
  student: { name, register, batch, date },
  summary: { "we' (cm-1)": 869.7, … },   // becomes the columns of the sheet
  data:    { … kept as JSON … },
  report:  [ {type:"heading"|"paragraph"|"table", …} ]   // becomes a Google Doc
}, messageElement);
```

The backend files each submission on a tab named after the experiment id, builds that tab's
columns from the keys of `summary` the first time it sees them, adds any new key as a new column
later, and writes one line per submission to a master log. A new experiment needs no changes to
`Code.gs` at all.

Submission is optional. With `APPS_SCRIPT_URL` left empty the button disappears and students
download or print their reports instead.

## The admin console

`admin/` is the instructor's side. It reads and writes the same Google Sheet through the Apps
Script deployment, guarded by the `ADMIN_KEY` you set in the script — kept in the browser tab
only, never written to disk.

| Panel | What it does |
|---|---|
| Connection | endpoint and admin key, tested before anything else opens |
| Batches | the groups you teach: name, programme, course, semester |
| Students | register number, name, batch, group; add one, or paste a list |
| Assignments | which experiment a batch is doing, in practice or assessed mode, with the link to share |
| Submissions | read from the sheet, filtered by experiment, with a list of who has not submitted and a CSV export |
| Programme, course, subject | re-files any experiment — including the coded ones — without touching the repository |
| Catalog builder | fills in a catalog entry and downloads `catalog.js` with it added |

## Where an experiment is filed

Programme, semester, course, subject, title, number, duration and summary are held in the sheet
and edited in the console. The portal reads them when it lists an experiment, and the experiment
page asks for its own before it draws the report header, so a change shows up in both without a
deploy.

What ships in `data/catalog.js` and `js/meta.js` is the fallback: it is what students see when
no endpoint is configured, or when the sheet cannot be reached. Nothing waits on the network —
the page renders from the built-in values and re-renders if the sheet answers with something
different. "Revert" in the console deletes the sheet row and the built-in values stand again.

## Instructor switches

Both are read by any experiment built on the template.

| URL | Effect |
|---|---|
| `experiments/<id>/` | normal working session |
| `experiments/<id>/?demo=1` | adds a button that fills in every reading, for demonstrating |

## One submission per candidate

Submitting finishes an experiment. The student's PDF is built and downloaded first, the record
is sent, and only then is the working cleared from the browser — so the next candidate at that
machine starts from a blank plate with nothing of the last one's left behind. If the PDF cannot
be built, nothing is sent and nothing is cleared.

A register number may submit a given experiment once. The browser remembers, and the sheet
enforces it: a second attempt is written to a **Repeat attempts** tab rather than replacing the
first or being thrown away, so you can see it happened and decide. Set `ONE_PER_STUDENT: false`
in `apps-script/Code.gs` to accept resubmissions normally.

## Tests

```bash
npm install jsdom                      # once, for the jsdom-based tests
node tests/site.js                     # portal filters, catalog integrity, the template
node experiments/alo-band-spectrum/tests/selftest.js
node experiments/alo-band-spectrum/tests/smoke.js
```

`tests/site.js` also checks that every live catalog entry has a matching folder and that its
`meta.js` id agrees with the catalog id — the two mistakes that break a new experiment silently.
