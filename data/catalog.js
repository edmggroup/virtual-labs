/* ============================================================
   catalog.js — the list of experiments on this site.

   Add an entry here and it appears on the portal, filed under
   its programme, course and subject. Nothing else on the portal
   needs editing. This is a plain JavaScript file rather than
   JSON so the site also works when opened straight off a disk,
   with no server.

   Fields
     id          folder name under experiments/, and the key the
                 backend files submissions under. Never reuse one.
     title       shown on the card
     number      experiment number in the course manual, if any
     programme   M.Sc. Physics, B.Sc. Physics, …
     semester    used to group within a programme
     course      the laboratory course as printed on the manual
     subject     the topic, used for the subject filter
     tags        extra words the search box should match
     duration    rough working time, shown on the card
     summary     one or two sentences, no marketing
     thumb       image relative to the site root, or null
     engine      omit for an experiment with its own folder of code;
                 "spec" for one described in a spec.json or written
                 in the admin console, which the generic engine runs
     status      "live" or "planned" — planned entries are shown
                 greyed out and are not clickable
   ============================================================ */

window.LAB_CATALOG = {

  experiments: [

    {
      id: "alo-band-spectrum",
      title: "Vibrational constants of AlO from its electronic band spectrum",
      number: 8,
      programme: "M.Sc. Physics",
      semester: "Semester III",
      course: "General Physics Laboratory V",
      subject: "Molecular spectroscopy",
      tags: ["band spectrum", "Deslandre", "Hartmann", "comparator", "diatomic", "anharmonicity"],
      duration: "2 h",
      summary: "Measure the band heads of the AlO B²Σ⁺ → X²Σ⁺ system on a photographic plate with a travelling comparator, calibrate against mercury lines, and obtain ωe and xe for both electronic states.",
      thumb: "experiments/alo-band-spectrum/docs/plate.png",
      status: "live"
    },

    {
      id: "hall-effect",
      title: "Hall coefficient and carrier concentration of a semiconductor",
      number: 3,
      programme: "M.Sc. Physics",
      semester: "Semester I",
      course: "General Physics Laboratory III",
      subject: "Solid state physics",
      tags: ["semiconductor", "magnetic field", "carrier density", "Hall voltage"],
      duration: "90 min",
      summary: "Pass a known current through a germanium slab in a magnetic field, measure the Hall voltage against field, and obtain the Hall coefficient, the carrier concentration and the sign of the majority carrier.",
      thumb: null,
      engine: "spec",
      status: "live"
    }

    /* ---- Entries below are examples of how the grouping works.
            Delete them, or replace them as you build each one. ----

    ,{
      id: "hall-effect",
      title: "Hall coefficient and carrier concentration of a semiconductor",
      number: 3,
      programme: "M.Sc. Physics",
      semester: "Semester I",
      course: "General Physics Laboratory III",
      subject: "Solid state physics",
      tags: ["semiconductor", "magnetic field", "carrier density"],
      duration: "2 h",
      summary: "Not built yet.",
      thumb: null,
      status: "planned"
    },
    {
      id: "planck-constant-photocell",
      title: "Planck's constant from the photoelectric effect",
      number: 2,
      programme: "B.Sc. Physics",
      semester: "Semester IV",
      course: "Modern Physics Laboratory",
      subject: "Quantum physics",
      tags: ["photoelectric", "stopping potential"],
      duration: "90 min",
      summary: "Not built yet.",
      thumb: null,
      status: "planned"
    }

    ---- */

  ]
};
