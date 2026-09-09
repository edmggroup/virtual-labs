# Putting the site online

Two pieces: the site on GitHub Pages, and — only if you want readings collected centrally — one
Google Apps Script web app shared by every experiment.

## 1. GitHub Pages

1. Create a repository, for example `virtual-physics-lab`. Public: Pages on a private repo needs
   a paid GitHub plan.
2. Upload the **contents** of this folder to the root of the default branch, so that `index.html`
   sits at the top with `shared/`, `experiments/`, `data/` and `.nojekyll` beside it. If the repo
   ends up with `vlab/index.html`, Pages will return a 404.

   ```bash
   git init
   git add .
   git commit -m "Virtual physics laboratory"
   git branch -M main
   git remote add origin https://github.com/<you>/virtual-physics-lab.git
   git push -u origin main
   ```

   The web uploader works too — drag the files and folders in — but check afterwards that
   `.nojekyll` came across. GitHub's uploader sometimes drops dotfiles; if it did, use
   **Add file → Create new file**, name it `.nojekyll`, leave it empty and commit. Without it,
   Pages runs Jekyll and hides `experiments/_template/`.

3. **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, save.
4. A minute later the portal is at `https://<you>.github.io/virtual-physics-lab/`.
5. Edit `shared/js/config.js` and set `SITE_TITLE`, `INSTITUTION`, `DEPARTMENT` and `TAGLINE`.
   These appear on the portal and on every report header.

To try it before pushing, run a static server from this folder:

```bash
python3 -m http.server 8000
```

and open `http://localhost:8000`. Opening `index.html` off the disk works as well — the catalog
is a `.js` file rather than JSON precisely so that it does.

## 2. One backend for every experiment

1. Create a Google Sheet, named something like *Virtual lab submissions*.
2. **Extensions → Apps Script**, delete the sample code and paste `apps-script/Code.gs`.
3. At the top of the file set `NOTIFY` to your email for a mail per submission, or leave it
   empty. `CREATE_DOC: false` turns off the per-student Google Doc if you only want rows.
4. Run `setUp` once from the editor and accept the permission prompts. Because the script is
   not Google-verified you will need **Advanced → Go to *(project)* (unsafe)**; that is expected
   for a script you wrote yourself.
5. **Deploy → New deployment → Web app.** Execute as **Me**, access **Anyone** — not "Anyone with
   a Google account", which would force students to sign in. Copy the `/exec` URL.
6. Put it in `shared/js/config.js`:

   ```js
   APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfy…/exec",
   ```

   That one line switches on submission for every experiment on the site, present and future.
7. Push, wait for the rebuild, and submit a test record. Open the `/exec` URL in a browser to see
   the tab names and how many submissions each holds.

### What the Sheet looks like

- **All submissions** — one line per submission across the whole site: timestamp, experiment,
  course, student, and a link to their report.
- **One tab per experiment**, named after the experiment id. Its columns are built from the keys
  of that experiment's `summary` the first time a submission arrives, and a new key later becomes
  a new column. The last two columns are always the report link and the raw JSON.
- **Drive → Virtual lab reports → *(experiment id)*** — the formatted document for each student,
  if `CREATE_DOC` is on.

### Two things that catch people out

**Editing `Code.gs` and saving does not update the live endpoint.** Go to Deploy → Manage
deployments → pencil → Version: **New version** → Deploy. Otherwise the old code keeps running.

**The page cannot read the reply.** It posts as `text/plain` with `mode: "no-cors"` so the
browser sends no preflight request, which is what makes a plain static site work with Apps
Script at all. The trade-off is that the site reports "sent" rather than "accepted", so tell
students to download their report as well — that copy cannot be lost.

## 3. Running a session

Send students the portal link and let them find the experiment, or link the experiment directly.
Add `?exam=1` for an assessed session: on-screen identification aids are switched off and locked.

Where an experiment generates per-student data from the register number, as the AlO one does,
two students who copy each other's readings produce identical raw numbers on plates that are not
identical — visible in the spreadsheet as an exact match of values that should differ in the
third decimal.

## 4. If something looks wrong

| Symptom | Usual cause |
|---|---|
| 404 on the site URL | Files uploaded one level too deep; `index.html` must be at the repo root |
| Portal loads but lists nothing | `data/catalog.js` has a syntax error — open the browser console |
| A card leads to a 404 | The catalog `id` and the folder name under `experiments/` disagree |
| `experiments/_template/` is missing online | `.nojekyll` did not get uploaded |
| Page loads unstyled | `shared/css/base.css` did not upload, or a filename's case changed; Pages is case-sensitive |
| Plain Times instead of the site fonts | Google Fonts blocked on that network; harmless, the fallbacks are fine |
| Submit says "not configured" | `APPS_SCRIPT_URL` is still empty in `shared/js/config.js` |
| Submissions never arrive | The deployment's access is not "Anyone", or the script was edited without deploying a new version |
