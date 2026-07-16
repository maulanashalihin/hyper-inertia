# @maulanashalihin/hyper-inertia

**Inertia.js v3 server-side adapter for HyperExpress** — native middleware, no adaptor bridge.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Implements the [Inertia.js protocol](https://inertiajs.com/the-protocol) natively on HyperExpress. Auto-detects Inertia XHR requests versus initial full-page loads, returning JSON for the former and a root HTML document for the latter.

Supports **Inertia v3 protocol**: asset versioning, partial reloads, shared props, merge/prepend/deep-merge props, deferred/lazy props, once props, encrypted history, and external/internal redirects.

## Features

- ✅ **Auto-detect** — `X-Inertia` header check: JSON for XHR, HTML for initial load
- ✅ **Page object** — `{ component, props, url, version }` as specified by the protocol
- ✅ **Asset versioning** — 409 Conflict + `X-Inertia-Location` on version mismatch
- ✅ **Shared props** — static (`share`) and dynamic per-request (`shareFunc`)
- ✅ **Partial reloads** — `X-Inertia-Partial-Data`, `X-Inertia-Partial-Except`
- ✅ **Internal redirects** — 303 See Other for form submissions
- ✅ **External redirects** — 409 Conflict + `X-Inertia-Location` for full page navigations
- ✅ **Back navigation** — Referer-based `back()` with fallback
- ✅ **Custom root template** — override via `config.render` for Vite, Webpack
- ✅ **Zero dependencies** — only peer dependency on `hyper-express`

## Installation

```bash
npm install @maulanashalihin/hyper-inertia
```

## Quick Start

```ts
import { Inertia } from "@maulanashalihin/hyper-inertia";
import HyperExpress from "hyper-express";

const server = new HyperExpress.Server();
const inertia = new Inertia({ version: "1.0" });

// 1. Register middleware (version checking, helper attachment)
server.use(inertia.middleware());

// 2. Render pages
server.get("/", async (req, res) => {
  await inertia.render(req, res, "Home", {
    title: "Welcome",
    user: { name: "Maulana" },
  });
});

// Or use the attached helper:
server.get("/dashboard", async (req, res) => {
  return (res as any).inertia("Dashboard", { stats: { users: 42 } });
});

server.listen(3000);
```

## Usage

### Shared props

```ts
// Static shared prop
inertia.share("appName", "Laju");

// Dynamic per-request prop
inertia.shareFunc("user", (req, res) => {
  return getCurrentUser(req);
});

// Page-specific props override shared props
await inertia.render(req, res, "Login", { user: null });
```

### Redirects

```ts
// Internal redirect (303 See Other) — Inertia follows via XHR
inertia.redirect(res, "/dashboard");

// External redirect (409 + X-Inertia-Location) — full page reload
inertia.location(res, "https://example.com");

// Back — go to previous page (from Referer header)
inertia.back(res, req);            // no Referer → "/"
inertia.back(res, req, "/home");   // no Referer → "/home"
```

### Custom root HTML

```ts
const inertia = new Inertia({
  version: "1.0",
  render: (req, res, page) => {
    const pageJSON = JSON.stringify(page);
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>${page.props.title || "App"}</title>
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body>
  <div id="app" data-page='${escapeHtml(pageJSON)}'></div>
  <script type="module" src="/assets/main.js"></script>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  },
});
```

## API Reference

### `new Inertia(config?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `version` | `string` | `""` | Asset version for cache busting |
| `render` | `function` | Default template | Custom root HTML renderer |

### `inertia.middleware()`

Returns a HyperExpress middleware function that:

- Checks asset version (409 on mismatch)
- Attaches `res.inertia()`, `res.flash()`, `res.redirect()` helpers

### `inertia.render(req, res, component, props?)`

Main render method. Returns JSON for XHR, HTML for initial load.

### `inertia.share(key, value)` / `inertia.shareFunc(key, fn)`

Register global props.

### `inertia.redirect(res, url)` / `inertia.location(res, url)` / `inertia.back(res, req, defaultUrl?)`

Redirect helpers.
