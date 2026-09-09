# Putting the lab online

Two pieces: the page itself on GitHub Pages, and — only if you want readings collected
centrally — a Google Apps Script web app writing into a Sheet.

## 1. GitHub Pages

1. Create a repository, for example `alo-band-spectrum`.
2. Upload everything in this folder to the root of the default branch. Either drag the files
   into GitHub's web uploader, or:

   ```bash
   git init
   git add .
   git commit -m "AlO band spectrum lab"
   git branch -M main
   git remote add origin https://github.com/<you>/alo-band-spectrum.git
   git push -u origin main
   ```

3. **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, save.
4. A minute later the lab is at `https://<you>.github.io/alo-band-spectrum/`.

Nothing needs building and there is no server. `node_modules/` (if you ran the tests) should
not be uploaded — a `.gitignore` is included.

To try it before pushing, run any static server locally:

```bash
python3 -m http.server 8000
```

and open `http://localhost:8000`. Opening `index.html` straight off the disk also works.

## 2. Collecting reports in a Google Sheet

1. Create a Google Sheet, name it something like *AlO lab submissions*.
2. **Extensions → Apps Script**. Delete the sample code and paste `apps-script/Code.gs`.
3. At the top of the file, set `NOTIFY` to your email if you want a mail per submission, or
   leave it empty. `CREATE_DOC` writes a formatted record into a Drive folder for each
   student; set it to `false` if you only want the spreadsheet rows.
4. Run `setUp` once from the editor and accept the permission prompts. This creates the
   `Submissions` tab.
5. **Deploy → New deployment → Web app.** Execute as **Me**, access **Anyone**. Copy the
   `/exec` URL.
6. Paste it into `js/config.js`:

   ```js
   APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfy…/exec",
   ```

7. Push the change. The **Submit to the department sheet** button now appears in the last step.

Open the `/exec` URL in a browser to check the endpoint: it reports how many submissions have
arrived.

### About the browser and CORS

The page posts JSON as `text/plain` with `mode: "no-cors"`, so the browser sends no preflight
request and Apps Script receives the body in `e.postData.contents`. The trade-off is that the
page cannot read the reply, so it reports "sent" rather than "accepted". Tell students to
download the report as well — that copy is the one that cannot be lost.

**Whenever you edit `Code.gs`, deploy a new version** (Deploy → Manage deployments → edit →
version: New version). Saving alone does not update the live `/exec` URL.

## 3. A note on marking

Each student's plate is derived from their register number, so two students who copy each
other's numbers produce identical readings on plates that are not identical — visible in the
spreadsheet as an exact match of the raw `d` values. Genuine work agrees on the constants
(the last columns) while differing in the third decimal of every reading.

For an assessed session, link students to `?exam=1`, which turns off the band identities on
the trace and the snapping of the crosswire.
