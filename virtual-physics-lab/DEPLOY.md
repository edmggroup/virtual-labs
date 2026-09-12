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

*The short version is below; [BACKEND.md](BACKEND.md) covers the same ground in full, with the
settings, the verification ladder and what to do when it will not connect.*

1. Create a Google Sheet, named something like *Virtual lab submissions*.
2. **Extensions → Apps Script**, delete the sample code and paste `apps-script/Code.gs`.
3. At the top of the file:
   - set **`ADMIN_KEY`** to a long phrase of your own. Nothing on the roster can be read or
     changed without it, and the script refuses admin requests while it still says `change-me`.
   - set `NOTIFY` to your email for a mail per submission, or leave it empty.
   - `CREATE_DOC: false` turns off the per-student Google Doc if you only want rows.
   - `ROSTER_ONLY: true` rejects submissions from register numbers that are not on the roster.
     Leave it `false` until you have loaded the roster.
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
8. Open `admin/` on the site, paste the same `/exec` URL and your admin key, and press Connect.
   Add a batch, paste in a class list, assign an experiment, and the link to hand out appears.

### What the Sheet looks like

- **Batches, Students, Assignments** — the roster, written by the admin console. You can also
  edit these tabs by hand; the console reads whatever is there.
- **All submissions** — one line per submission across the whole site: timestamp, experiment,
  course, student, and a link to their report.
- **Experiments** — where each experiment is filed (programme, course, subject and the rest),
  and the full description of any experiment written in the console. Editing this tab by hand
  works too; the console just saves you the typing.
- **Repeat attempts** — a register number that submits the same experiment twice. The first
  record stands; the later one is filed here with its full JSON so nothing is lost.
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

Submitting is final and may be done once per register number. The student's PDF is downloaded
before anything is sent, and their working is cleared afterwards, so a shared machine is ready
for the next candidate. Tell students to keep that PDF: it is their copy of the record.

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


## 5. Deploying an update

Two independent halves. Changing the site does not require touching Apps Script, and changing
Apps Script does not require touching the site.

### The site

```bash
git add -A
git commit -m "What changed"
git push
```

Pages rebuilds in about a minute. Then, **if you changed any file listed in `sw.js`**, bump the
cache name in that file — `var CACHE = "vlab-v1"` to `"vlab-v2"` — and push again. Without that,
browsers that already installed the site keep serving the old copy from the service worker, and
students will report that your fix "did not appear". The version bump is the whole update
mechanism: on the next visit the worker installs the new cache, drops the old one, and takes over.

To confirm an update landed, open the site and hard-reload (Ctrl/Cmd-Shift-R), or in DevTools →
Application → Service Workers press **Update**, then **Unregister** if it is being stubborn.
Students on phones can also close and reopen the installed app twice.

### The Apps Script

Editing `Code.gs` and saving changes **nothing** that is live. Every time:

1. Paste the new `Code.gs` over the old one and save.
2. **Deploy → Manage deployments → pencil → Version: New version → Deploy.**
3. Keep the same deployment, so the `/exec` URL does not change and nothing on the site needs
   editing. If you create a *new* deployment instead, you get a new URL and must update
   `shared/js/config.js`.
4. If you added a new permission — the first time the script sends mail, or creates Drive files —
   run any function once from the editor and accept the prompt, or the deployment will fail
   silently on that step.

Reload the `/exec` URL afterwards: it lists the tabs and their row counts, which is the quickest
proof that the new code is the code running.

### Order of operations, when both change

Deploy the Apps Script first, then push the site. The site tolerates an older backend badly only
in one direction: a new page calling an action the deployed script does not know yet gets a
silent no-op, because submissions are posted `no-cors` and the reply cannot be read.
