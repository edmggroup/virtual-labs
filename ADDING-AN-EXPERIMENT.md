# Adding an experiment

There are two ways in. Most experiments need no code at all.

| | Described in the admin console | Written as an experiment folder |
|---|---|---|
| Effort | a form, ten minutes | JavaScript |
| Suits | anything measured into a table and worked out from formulae | a simulated instrument with its own physics, like the AlO plate |
| Lives in | the Google Sheet, published from the console | `experiments/<id>/` in the repository |
| Runs on | the generic engine, `experiments/_generic/` | its own page |
| Needs a deploy | no | yes |

## A. Describing one in the console — no code

Open `admin/` → **Experiment builder**. You give it the observation table, the quantities to be
worked out, and the formula behind each one. Press **Check the description** and it tells you
about every unparseable formula and every name that is not a constant, a column, or a quantity
defined above it. Then **Publish**, and the experiment appears on the portal at
`experiments/_generic/?id=<your-id>`.

What you can describe:

- **Constants** — `key, label, value, unit`, one per line.
- **Table columns** — `key | label | unit | kind | formula-or-source | dp`, where kind is
  `input` (the student sets it), `measured` (read off a simulated instrument), or `calc` (the
  student works it out and is marked ✓ or ✗ against their own row).
- **A simulated instrument** — for a `measured` column, `formula ; noise ; offset`. The scatter
  is derived from the student's register number, so every student gets their own readings and the
  same student always gets theirs back. `1000*(-0.00042)*I*B/t ; 0.02 ; 0.11` is the Hall probe
  in the worked example.
- **A graph** — name the x and y columns and it is drawn, fitted, and put in the PDF.
- **Quantities and results** — `key | label | formula | unit | dp | expected`, using constants,
  column keys, anything defined above, and `mean sum min max count slope intercept r2 sqrt abs ln
  log exp sin cos tan round`.
- **Questions** — one per line.

`experiments/hall-effect/spec.json` is a complete worked example you can copy: field against Hall
voltage, a fitted slope, the Hall coefficient and the carrier concentration. Download the JSON
from the builder and drop it in `experiments/<id>/spec.json` if you would rather keep an
experiment in the repository than in the sheet — the engine looks there first.

The formulae never fill anything in. They exist to check what the student typed, exactly as in
the hand-written experiments.

## B. Writing one as a folder — for a simulated instrument

Needed when the apparatus itself has to be modelled. Two things are required: a folder under
`experiments/` and an entry in `data/catalog.js`. Nothing in `shared/`, and nothing in
`apps-script/Code.gs`, needs to change.

### 1. Copy the template

```bash
cp -r experiments/_template experiments/hall-effect
```

Use the same short, lowercase, hyphenated id everywhere: the folder name, `js/meta.js`, and the
catalog entry. The backend files submissions under that id, so pick it once and leave it alone —
changing it later splits a class's results across two tabs.

Edit `experiments/hall-effect/js/meta.js`:

```js
window.EXPERIMENT = {
  id: "hall-effect",
  title: "Hall coefficient and carrier concentration of a semiconductor",
  number: 3,
  programme: "M.Sc. Physics",
  course: "General Physics Laboratory III",
  subject: "Solid state physics"
};
```

The template already runs: student details, a table of readings, a straight-line fit, print, CSV
and submission. Replace the physics in `analyse()`, the apparatus above `#steps`, and the step
list. Keep the four things the site relies on — the step rail, state saved under the register
number, a result derived from the readings, and a report.

### 2. List it on the portal

Add an entry to `data/catalog.js`:

```js
{
  id: "hall-effect",
  title: "Hall coefficient and carrier concentration of a semiconductor",
  number: 3,
  programme: "M.Sc. Physics",
  semester: "Semester I",
  course: "General Physics Laboratory III",
  subject: "Solid state physics",
  tags: ["semiconductor", "magnetic field", "carrier density"],
  duration: "2 h",
  summary: "One or two sentences on what is measured and how.",
  thumb: "experiments/hall-effect/docs/apparatus.png",
  status: "live"
}
```

`programme`, `course` and `subject` populate the three filters and the grouping, so spell them
exactly as you do elsewhere — "M.Sc. Physics" and "MSc Physics" become two separate entries in
the dropdown. Set `status: "planned"` to show an experiment greyed out and unclickable while you
build it.

### 3. Decide what the sheet should hold

`summary` becomes the columns of that experiment's tab, one row per submission:

```js
VirtualLab.submit({
  student: S.student,
  summary: { "R_H (m3/C)": 4.1e-4, "n (m-3)": 1.5e22, "readings": 12 },
  data:    { readings: S.readings, notes: S.notes },
  report:  [
    { type: "heading",   text: "Observations" },
    { type: "table",     caption: "Readings", rows: [["B (T)","V_H (mV)"], ["0.10","2.4"]] },
    { type: "paragraph", text: "…" }
  ]
}, el("submitMsg"));
```

Keep the `summary` keys short, stable and identical between submissions — they are column
headings, and a renamed key becomes a new column with the old one left blank. Put anything
bulky or variable in `data`, which is stored as JSON in the last column. `report` blocks become
the student's Google Doc; only `heading`, `paragraph` and `table` are understood.

### 4. Check it

```bash
node tests/site.js
```

This confirms the catalog entry points at a folder that exists, that `meta.js` and the catalog
agree on the id, and that the filters still behave. Then open the portal locally
(`python3 -m http.server 8000`) and click through the new card.

## Two patterns worth following

**Let the student do the arithmetic.** The pattern used in the AlO experiment is worth copying:
store what they type, and check it against what follows from their *own* earlier figures rather
than against your model's answer. A helper of a dozen lines does it —

```js
function check(typed, expected, tol) { … }   // "ok" | "off" | "empty"
```

— and the mark beside each field says only whether it is consistent. The student learns where the
error is without being handed the value, and the report carries their working, not the app's.

**Produce one PDF and nothing else.** Describe the record once as blocks and let the shared
module render it three ways:

```js
var blocks = [ {type:"title", text:"…"}, {type:"table", rows:[…]}, {type:"image", svg: mySvg} ];
ReportDoc.html(blocks);                                  // the preview on screen
ReportDoc.download(blocks, meta, "record.pdf");          // what the student downloads
ReportDoc.forBackend(blocks);                            // what the Sheet turns into a Doc
```

Add your new files to the precache list in `sw.js` so the experiment works offline, and bump the
cache version when you deploy.

## House style

The shared stylesheet already provides the page shell (`.masthead`, `.shell`, `.rail`, `.work`),
`.card`, `.note` (with `.warn` and `.bad`), `.formula`, `.field`, `.tablewrap`, `.result-strip`,
`.recordbar`, and buttons as `.primary`, `.ghost` and `.link`. Use them rather than new classes,
so a student moving between experiments meets the same interface. Put anything genuinely specific
to your apparatus in `css/experiment.css`.

Two conventions worth keeping:

- **Read `?exam=1`** and switch off any on-screen aid that would give away what the student is
  meant to work out, then disable the toggle so it cannot be turned back on.
- **Derive the data from the physics**, and let the analysis recover the constants you started
  from. A self-test that does exactly that (`tests/selftest.js` in the AlO experiment) catches
  mistakes long before a student does.

## Layout

Both routes get the same shell, and it is built to use whatever screen it is on: a fluid gutter
and rail, prose held to a readable measure while tables and instruments take the room going,
two experiments abreast on the portal past 1180px, a scrolling step rail and 16px fields on a
phone, thinner furniture in landscape, and safe-area insets on notched devices. Use the shared
classes and you inherit all of it; `tests/site.js` fails the build if a page shell goes back to
fixed gutters or a fixed width wider than a phone.
