# Adding an experiment

Two things are required: a folder under `experiments/` and an entry in `data/catalog.js`. Nothing
in `shared/`, and nothing in `apps-script/Code.gs`, needs to change.

## 1. Copy the template

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

## 2. List it on the portal

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

## 3. Decide what the sheet should hold

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

## 4. Check it

```bash
node tests/site.js
```

This confirms the catalog entry points at a folder that exists, that `meta.js` and the catalog
agree on the id, and that the filters still behave. Then open the portal locally
(`python3 -m http.server 8000`) and click through the new card.

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
