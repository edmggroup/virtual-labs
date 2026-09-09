# Virtual Physics Laboratory

A static site that hosts simulated laboratory experiments, grouped by programme, course and
subject, with one shared submission backend behind all of them.

No build step and no dependencies: it is HTML, CSS and plain JavaScript, so GitHub Pages serves
it as it stands. See [DEPLOY.md](DEPLOY.md) to put it online and
[ADDING-AN-EXPERIMENT.md](ADDING-AN-EXPERIMENT.md) to add the next one.

## What is here

```
index.html                     the portal: filter by programme, course or subject
data/catalog.js                the list of experiments — edit this to add one
shared/css/base.css            design tokens, buttons, tables, forms, print rules
shared/css/portal.css          the front page
shared/js/config.js            site settings, including the one submission address
shared/js/lab-submit.js        the common envelope and the single POST
shared/js/portal.js            filtering and grouping on the front page
experiments/<id>/              one folder per experiment, self-contained
experiments/_template/         a working skeleton to copy
apps-script/Code.gs            the backend: one Sheet tab per experiment
tests/site.js                  portal filtering + the template, in jsdom
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

![The simulated plate](experiments/alo-band-spectrum/docs/plate.png)

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

## Instructor switches

Both are read by any experiment built on the template.

| URL | Effect |
|---|---|
| `experiments/<id>/` | normal working session |
| `experiments/<id>/?exam=1` | on-screen identification aids off and locked |
| `experiments/<id>/?demo=1` | adds a button that fills in every reading, for demonstrating |

## Tests

```bash
npm install jsdom                      # once, for the jsdom-based tests
node tests/site.js                     # portal filters, catalog integrity, the template
node experiments/alo-band-spectrum/tests/selftest.js
node experiments/alo-band-spectrum/tests/smoke.js
```

`tests/site.js` also checks that every live catalog entry has a matching folder and that its
`meta.js` id agrees with the catalog id — the two mistakes that break a new experiment silently.
