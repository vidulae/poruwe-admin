# Poruwe Admin

The operations console for the [Poruwe platform](https://github.com/vidulae/poruwe-platform) — a static single-page app.

## Features

- **Dashboard** — pending verifications, live invitations, upcoming weddings, revenue, 8-week order chart
- **Orders** — filter/search, full order drawer (data, photos, payment slip, audit trail), approve / reject / extend / revoke & purge, CSV export
- **Templates** — edit prices and visibility live
- **Settings** — bank transfer details, PayHere credentials & sandbox toggle, support WhatsApp, admin password change

## Configuration

`config.js` points the app at the platform API — `http://localhost:4323` during development, the production URL otherwise.

## Run locally

```bash
node serve.js
# open http://localhost:4324 (platform must be running on :4323)
```

Deployed as a static site; authentication is a password issued by the platform (`ADMIN_PASSWORD`), exchanged for a signed 12-hour token.
