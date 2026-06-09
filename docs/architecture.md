# Journal Architecture

The site is a static Vite app deployed to GitHub Pages at `journal.simonlast.org`.
Image files are generated locally from Lightroom exports and can be uploaded to
Cloudflare R2 for production serving.

## Local Development

```bash
npm install
npm run photos:process
npm run dev
```

The default input folder is `/Users/simonlast/Pictures/Published`. That Finder
folder is the publishing source of truth: put only the photos that should be live
there. Generated image assets go to `public/photos`, and the app imports the
internal generated manifest at `src/data/photos.generated.json`.

## Image Pipeline

`npm run photos:process` generates:

- One bounded AVIF image for the scrolling page.
- One byte-for-byte original copy for the lightbox.
- A small base64 placeholder and dominant color.
- A manifest consumed by the React app.

Generated filenames include a content hash. Re-running the processor reuses
existing assets and manifest entries for unchanged source files, so adding a few
new exports does not re-encode the whole library.

The manifest stores image filenames only. The app prefixes them with
`VITE_PHOTO_BASE_URL` at build/runtime. Local development defaults to `/photos`;
the GitHub Pages workflow builds with `https://img.photos.simonlast.org`.

## R2 Upload

Create `.env` or use `.envrc` with:

```bash
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
R2_BUCKET=simonlast-photos
R2_PUBLIC_BASE_URL=https://img.photos.simonlast.org
```

Then run:

```bash
npm run photos:process
npm run photos:upload
```

Uploaded objects use immutable one-year cache headers. Filenames include a
content hash, so replacing a source image creates new URLs. The upload command
lists existing R2 objects first, skips files whose remote size already matches
the local generated file, and deletes generated photo objects no longer
referenced by the current manifest.

## Deployment

GitHub Pages should be configured to deploy from GitHub Actions. The workflow
builds and uploads `dist`. The repo includes `CNAME` for `journal.simonlast.org`.

Cloudflare DNS:

- `journal` proxied CNAME to `simonlast.github.io`.
- `img.photos` connected as a proxied R2 custom domain.

Keep R2 secrets out of git.
