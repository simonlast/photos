# Photos

Static photo site for `photos.simonlast.org`.

## Development

```bash
npm install
npm run photos:process
npm run dev
```

The local photo processor reads `/Users/simonlast/Pictures/Published` by
default. Put only the photos you want live in that Finder folder, then run the
processor. It writes generated assets to ignored `public/photos` and updates the
internal manifest at `src/data/photos.generated.json`. Each photo gets one
bounded AVIF for the scrolling page and one original file copy for the lightbox.
Re-running the processor is incremental: unchanged hash-named assets are reused.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

After Cloudflare DNS and R2 are configured, run the same browser suite against
production:

```bash
npm run test:e2e:prod
```

## Publishing

GitHub Pages deploys `dist` through `.github/workflows/deploy.yml` and serves
`photos.simonlast.org` via `CNAME`.

Production image assets should be uploaded to Cloudflare R2:

```bash
npm run photos:process
npm run photos:upload
```

R2 sync is incremental: objects already present in R2 with the same size are
skipped, and generated photo assets no longer referenced by the current manifest
are deleted from the bucket. Cloudflare credentials belong in local `.envrc` or
`.env`, never in git. See `docs/architecture.md` for the full setup.
