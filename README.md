# Photos

Static photo site for `photos.simonlast.org`.

## Development

```bash
npm install
npm run photos:process
npm run dev
```

The local photo processor reads `/Users/simonlast/Pictures/Lightroom exports`
by default, writes generated assets to ignored `public/photos`, and updates
`src/data/photos.generated.json`. Each photo gets one bounded AVIF for the
scrolling page and one original file copy for the lightbox.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

## Publishing

GitHub Pages deploys `dist` through `.github/workflows/deploy.yml` and serves
`photos.simonlast.org` via `CNAME`.

Production image assets should be uploaded to Cloudflare R2:

```bash
npm run photos:process
npm run photos:upload
```

R2 credentials belong in local `.envrc` or `.env`, never in git. See
`docs/architecture.md` for the full setup.
