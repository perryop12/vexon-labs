# Vexon Labs — website

Static site: plain HTML/CSS/JS with no build step for public pages. It deploys unchanged to **GitHub Pages** or **Vercel**.

```
index.html                 Home
work/semestra/index.html   Semestra case study (public)
p/stratus/index.html       Stratus dossier (ENCRYPTED, collaborators only)
p/guapp/index.html         Guapp dossier   (ENCRYPTED, collaborators only)
assets/                    Shared CSS, JS, images
scripts/build-private.mjs  Encrypts private/*.html -> p/*/index.html
scripts/gate.html          The unlock page wrapped around each encrypted dossier
private/                   PLAINTEXT dossier sources + source docs  (gitignored, never committed)
.env.local                 Access keys per project                  (gitignored, never committed)
```

## How the private pages work

Each dossier in `private/<slug>.html` is encrypted with **AES-256-GCM**. The key is derived from that project's access key with **PBKDF2-SHA256** (600,000 iterations). Only the ciphertext is committed and published. Collaborators unlock it in their browser, so it works on any static host and needs no server.

- The two projects have **separate keys**, so Stratus collaborators can't open Guapp and Guapp collaborators can't open Stratus.
- `/p/` is excluded in `robots.txt`, marked `noindex`, and not linked from the public site.
- **Share link:** `https://<your-domain>/p/stratus/#k=<access-key>`. The part after `#` is never sent to the server. The page removes it from the address bar after unlocking and remembers the key on that device.
- **Revoking access** (for example when someone leaves a project): change the key in `.env.local`, rebuild, and push. Old links and remembered keys stop working. Then send the new link to the collaborators who remain.

> ⚠️ `private/` is gitignored on purpose. The repo only holds encrypted output, so **back up `private/` and `.env.local`** somewhere safe (a password manager, or a private drive). If you lose them, you can't edit the dossiers.

## Editing

| Change | Do this |
|---|---|
| Public page | Edit the HTML and push. |
| Private dossier | Edit `private/<slug>.html`, run `npm run build:private`, then push. |
| New private project | Add it to `PROJECTS` in `scripts/build-private.mjs`, add its key to `.env.local`, and build. |
| Generate missing keys | `npm run passwords` (existing keys are kept). |

Local preview: `python3 -m http.server 4321`, then open http://localhost:4321.

## Deploy

**GitHub Pages:** push to a GitHub repo, then Settings → Pages → Deploy from branch → `main` / root. The repo can be public, because the dossiers are encrypted.

**Vercel (recommended for a custom domain):** import the GitHub repo at vercel.com/new. Framework preset: **Other**. No build command. Output directory: `.`. `vercel.json` adds `noindex` and no-referrer headers for `/p/`.

Before launch:
- Replace the placeholder contact email `hello@vexonlabs.co` in `index.html`.
