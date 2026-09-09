/* ============================================================
   config.js — one place for everything that is true of the
   whole virtual laboratory. Every experiment reads this, so
   the submission address is set once, not once per experiment.
   ============================================================ */

window.VLAB_CONFIG = {

  /* Paste the /exec URL of the Apps Script web app here to turn on
     "Submit" in every experiment at once. Leave it empty and the
     button stays hidden; students download their reports instead. */
  APPS_SCRIPT_URL: "",

  SITE_TITLE: "Virtual Physics Laboratory",
  INSTITUTION: "CHRIST (Deemed to be University), Bengaluru",
  DEPARTMENT: "Department of Physics and Electronics",

  /* Shown on the portal under the title. */
  TAGLINE: "Simulated experiments for the physics laboratory courses.",

  /* Where the portal lives, relative to an experiment page. Only
     change this if you nest experiments more deeply. */
  HOME: "../../index.html"
};
