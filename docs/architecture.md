# Photos Architecture

The site is a static Vite app deployed to GitHub Pages at `photos.simonlast.org`.
Image files are generated locally from Lightroom exports and can be uploaded to
Cloudflare R2 for production serving.

## Local Development

```bash
npm install
npm run photos:process
npm run dev
```

The default input folder is `/Users/simonlast/Pictures/Lightroom exports`.
Generated image assets go to `public/photos`, and the app imports
`src/data/photos.generated.json`.

## Image Pipeline

`npm run photos:process` generates:

- AVIF, WebP, and JPEG responsive display variants.
- A high-resolution JPEG lightbox image.
- A small base64 placeholder and dominant color.
- A manifest consumed by the React app.

Set `VITE_PHOTO_BASE_URL` to switch generated manifest URLs. For local
development the default is `/photos`. For R2 it should be the public image
domain, for example `https://img.photos.simonlast.org`.

## R2 Upload

Create `.env` or use `.envrc` with:

```bash
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=simonlast-photos
R2_PUBLIC_BASE_URL=https://img.photos.simonlast.org
```

Then run:

```bash
VITE_PHOTO_BASE_URL="$R2_PUBLIC_BASE_URL" npm run photos:process
npm run photos:upload
```

Uploaded objects use immutable one-year cache headers. Filenames include a
content hash, so replacing a source image creates new URLs.

## Deployment

GitHub Pages should be configured to deploy from GitHub Actions. The workflow
builds and uploads `dist`. The repo includes `CNAME` for `photos.simonlast.org`.

Cloudflare DNS:

- `photos` CNAME to `simonlast.github.io`.
- `img.photos` connected as an R2 custom domain.

Keep R2 secrets out of git.
