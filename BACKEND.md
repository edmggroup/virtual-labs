# Connecting the backend

The site works with no backend at all: students do the whole experiment and download their PDF.
Connecting one adds three things — submissions arrive in a Google Sheet, the admin console can
manage batches and re-file experiments, and experiments can be written in the console without
touching the repository.

It is one Apps Script deployment for the whole site, set up once.

---

## 1. The sheet

Create a Google Sheet. Name it something you will recognise a year from now — *Virtual lab
submissions*. Nothing needs to be in it; the script builds its own tabs.

**Extensions → Apps Script.** The editor opens on a file called `Code.gs` containing a stub.
Select everything in it (Ctrl/Cmd-A) and paste `apps-script/Code.gs` over it. Save (Ctrl/Cmd-S).

Saving does not put anything live. Nothing works until step 4.

## 2. The settings block

At the top of `Code.gs`:

```js
var SETTINGS = {
  MASTER_SHEET: 'All submissions',
  REPEAT_SHEET: 'Repeat attempts',
  ONE_PER_STUDENT: true,
  CREATE_DOC: true,
  DOC_FOLDER: 'Virtual lab reports',
  NOTIFY: '',
  ADMIN_KEY: 'change-me',
  ROSTER_ONLY: false
};
```

| Setting | What to do with it |
|---|---|
| `ADMIN_KEY` | **Change it.** A phrase of your own, long enough not to be guessed. The admin console asks for it; nothing on the roster can be read or changed without it. While it still says `change-me` the script refuses every admin request, which is the intended failure. |
| `NOTIFY` | Your email for a message per submission, or `''` for none. On a class of sixty, `''`. |
| `CREATE_DOC` | `true` writes a formatted Google Doc per submission into Drive. `false` if you only want spreadsheet rows — it is also faster. |
| `ONE_PER_STUDENT` | `true` means a register number submits an experiment once; a later attempt is filed on the *Repeat attempts* tab instead of replacing the first. |
| `ROSTER_ONLY` | `true` rejects submissions from register numbers not on the roster. Leave `false` until you have loaded a class list, or nobody will be able to submit. |

## 3. Authorise, and build the tabs

Choose `setUp` in the function dropdown at the top of the editor and press **Run**.

Google will ask for permissions, and because the script is not published to the Google
Marketplace it will warn that it is unverified. That is expected for a script you pasted in
yourself: **Advanced → Go to *(project name)* (unsafe)** → Allow. It needs the sheet (to file
submissions), Drive and Docs (to write the reports), and Gmail (only if `NOTIFY` is set).

`setUp` creates the tabs the site expects. Check the Execution log says it completed, then look
at the sheet: you should see **All submissions**, **Batches**, **Students**, **Assignments** and
**Experiments**.

## 4. Deploy as a web app

**Deploy → New deployment → gear icon → Web app.**

| Field | Value | Why |
|---|---|---|
| Description | anything | for your own reference |
| Execute as | **Me** | the script writes to *your* sheet on behalf of anonymous students |
| Who has access | **Anyone** | not "Anyone with a Google account" |

That last one is the single most common mistake. "Anyone with a Google account" sounds safer, but
it makes Google redirect every request to a sign-in page, and a static page cannot follow that —
so submissions fail silently and the admin console reports that it cannot reach the endpoint.
"Anyone" is what a public form needs; the admin key is what protects the data.

Press **Deploy** and copy the **Web app URL**. It ends in `/exec`.

## 5. Tell the site where it is

Edit `shared/js/config.js`:

```js
window.VLAB_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfy…/exec",
  …
};
```

Paste the `/exec` URL, nothing else — no `/dev` URL, no trailing spaces or newline. Commit and
push. That one line switches on submission for every experiment on the site, present and future.

Then bump `var CACHE` in `sw.js` by one and push again, or browsers that already hold the site
keep using the old config and will behave as though no endpoint exists.

## 6. Check it, in this order

Each step proves the one before it, so do them in order and stop at the first failure.

1. **Paste the `/exec` URL into a browser tab.** You should get a short page listing the sheet
   tabs and their row counts. A sign-in page means step 4 is wrong. A 404 means the URL is wrong
   or nothing is deployed.
2. **Add the query the page actually uses:** `…/exec?action=ping&callback=cb`. You should see the
   literal text `cb({"ok":true,"service":"virtual-lab",…});`. If step 1 worked but this does not,
   your `Code.gs` is an older copy — paste the current one and deploy a new version.
3. **Open `/admin/` on the site.** Paste the same `/exec` URL and your admin key, press Connect.
   It should say connected and report how many batches and students it found.
4. **Add a batch and one student** in the console, then reload — they should still be there,
   and they should appear on the Batches and Students tabs of the sheet.
5. **Submit a test record** from the experiment. A row should appear on **All submissions** and on
   the experiment's own tab, with a link to the Doc if `CREATE_DOC` is on.
6. **Submit the same register number again.** It should land on **Repeat attempts**, and the first
   record should be untouched.

## 7. What ends up where

| Tab | Holds |
|---|---|
| All submissions | one line per submission across the whole site, with a link to the report |
| *(experiment id)* | one tab per experiment; its columns are built from that experiment's summary the first time a record arrives, and a new key later becomes a new column |
| Repeat attempts | a second submission from a register number that has already submitted, with its full JSON |
| Batches, Students, Assignments | the roster, written by the admin console; you can edit these by hand too |
| Experiments | where each experiment is filed, and the full description of any experiment written in the console |
| Drive → Virtual lab reports → *(experiment id)* | the formatted document for each student |

## 8. How the connection works, and what it cannot tell you

A static page on GitHub Pages cannot read a normal Apps Script reply, so the site uses two
one-way channels:

- **Reading** — the page loads `…/exec?action=…&callback=cb` as a script tag, and the script
  replies with JavaScript that calls `cb(…)`. This is why `doGet` returns JSONP.
- **Writing** — submissions and admin changes are posted as `text/plain` with `mode: "no-cors"`,
  which is what avoids a CORS preflight the script cannot answer.

The consequence is worth knowing: **a POST cannot be confirmed.** The page reports "Sent" once the
request has left the machine, whether or not the script accepted it. So a student who submits
twice sees "Sent" both times — the honest record of what happened is the *Repeat attempts* tab,
not the message on their screen. The admin console's Connect, which reads, is the reliable test of
whether the endpoint is alive.

## 9. Changing the script later

Editing `Code.gs` and saving changes nothing that is live. Every time:

**Deploy → Manage deployments → pencil → Version: New version → Deploy.**

Keep the same deployment so the `/exec` URL does not change. Creating a *New deployment* gives you
a different URL, and you would have to paste it into `shared/js/config.js` and push again.

If a change adds a permission — the first time the script sends mail or writes to Drive — run any
function once from the editor and accept the prompt, or that step fails quietly in the deployed
copy.

## 10. When it will not connect

| What you see | Almost always |
|---|---|
| Could not reach the endpoint | wrong URL, not deployed, or the request blocked before it left the browser |
| The script did not answer | it returned a sign-in page or an error page instead of JavaScript — access is not "Anyone" |
| Wrong admin key | it connected; the key does not match `ADMIN_KEY` |
| Set ADMIN_KEY in the script | it connected; `ADMIN_KEY` is still `change-me` |
| Connects, but submissions never arrive | the script was edited without deploying a new version |
| Works at home, not at college | the network blocks `script.google.com` or `script.googleusercontent.com`; test on mobile data to confirm, then ask IT |
| Worked yesterday, not today | the browser is serving a cached `config.js` — bump `CACHE` in `sw.js`, hard-reload, or unregister the service worker |
