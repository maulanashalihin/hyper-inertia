# hyper-express-inertia

**Inertia.js v3 server-side adapter for HyperExpress** — native middleware, no adaptor bridge.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Implements the [Inertia.js protocol](https://inertiajs.com/the-protocol) natively on HyperExpress. Auto-detects Inertia XHR requests versus initial full-page loads, returning JSON for the former and a root HTML document for the latter.

Supports **Inertia v3 protocol**: asset versioning, partial reloads, shared props, merge/prepend/deep-merge props, deferred/lazy props, once props, encrypted history, and external/internal redirects.

## Features

- ✅ **Auto-detect** — `X-Inertia` header check: JSON for XHR, HTML for initial load
- ✅ **Page object** — `{ component, props, url, version }` as specified by the protocol
- ✅ **Asset versioning** — `X-Inertia-Version` in every JSON response
- ✅ **Shared props** — static (`share`) and dynamic per-request (`shareFunc`)
- ✅ **Partial reloads** — `X-Inertia-Partial-Data`, `X-Inertia-Partial-Except`
- ✅ **Internal redirects** — 303 See Other for form submissions
- ✅ **External redirects** — 409 Conflict + `X-Inertia-Location` for full page navigations
- ✅ **Back navigation** — Referer-based `back()` with fallback
- ✅ **Flash messages** — `inertia.flash()` for one-time feedback
- ✅ **Built-in template** — customizable title, favicon, CSRF, Vite dev/prod
- ✅ **Custom root template** — full control via `config.render`
- ✅ **Zero dependencies** — only peer dependency on `hyper-express`

## Installation

```bash
npm install hyper-express-inertia
```

## Quick Start

```ts
import { Inertia } from "hyper-express-inertia";
import HyperExpress from "hyper-express";

const server = new HyperExpress.Server();
const inertia = new Inertia({ version: "1.0" });

// Render pages directly — no middleware needed
server.get("/", async (req, res) => {
  await inertia.render(req, res, "Home", {
    title: "Welcome",
    user: { name: "Maulana" },
  });
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

### Built-in template customization

```ts
const inertia = new Inertia({
  version: "1.0",
  title: "Laju",
  favicon: "/favicon.ico",
  csrf: true,                        // reads req.csrf_token
  devUrl: "http://localhost:5173",    // Vite dev server
  script: "src/app.js",
  stylesheet: "src/index.css",
});

// For production, pass the Vite manifest:
import manifest from "./dist/.vite/manifest.json" with { type: "json" };

const inertia = new Inertia({
  version: "1.0",
  script: "src/app.js",
  stylesheet: "src/index.css",
  manifest,  // auto-resolves hashed filenames
});
```

### Custom root HTML (full control)

```ts
const inertia = new Inertia({
  version: "1.0",
  render: (req, res, page) => {
    const pageJSON = escapeHtml(JSON.stringify(page));
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>${page.props.title || "App"}</title>
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body>
  <div id="app" data-page='${pageJSON}'></div>
  <script type="module" src="/assets/main.js"></script>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  },
});
```

### Flash messages

```ts
inertia.flash(res, "error", "Invalid credentials");
inertia.flash(res, "success", "Profile updated!");
```

## API Reference

### `new Inertia(config?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `version` | `string` | `""` | Asset version for cache busting |
| `render` | `function` | — | Custom root HTML renderer (overrides built-in template) |
| `title` | `string` | `"Inertia"` | Default page title fallback |
| `favicon` | `string` | — | Favicon href (e.g. `"/favicon.ico"`) |
| `csrf` | `boolean \| function` | — | CSRF token; `true` reads `req.csrf_token`, or pass a function |
| `devUrl` | `string` | — | Vite dev server URL (enables dev mode with HMR client) |
| `manifest` | `object` | — | Vite manifest (`dist/.vite/manifest.json`) for production assets |
| `script` | `string` | `"/assets/main.js"` | JS entry point; dev → `{devUrl}/{script}`, prod → resolved via manifest |
| `stylesheet` | `string` | — | CSS entry point; dev → `{devUrl}/{stylesheet}`, prod → resolved via manifest |

### `inertia.render(req, res, component, props?)`

Main render method. Returns JSON for XHR, HTML for initial load.

### `inertia.share(key, value)` / `inertia.shareFunc(key, fn)`

Register global props.

### `inertia.flash(res, type, message)`

Set a flash message cookie (5s TTL). The cookie is automatically picked up by the frontend.

### `inertia.redirect(res, url)` / `inertia.location(res, url)` / `inertia.back(res, req, defaultUrl?)`

Redirect helpers.
