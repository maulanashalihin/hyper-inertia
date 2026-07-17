"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Inertia: () => Inertia,
  back: () => back,
  default: () => index_default,
  filterPartialProps: () => filterPartialProps,
  getReferer: () => getReferer,
  isPartialRequest: () => isPartialRequest,
  location: () => location,
  redirect: () => redirect,
  versionFromEnv: () => versionFromEnv,
  versionFromFile: () => versionFromFile
});
module.exports = __toCommonJS(index_exports);

// src/partial.ts
function isPartialRequest(req, component) {
  return req.header("X-Inertia-Partial-Component") === component;
}
function filterPartialProps(props, req) {
  const partialData = req.header("X-Inertia-Partial-Data");
  const partialExcept = req.header("X-Inertia-Partial-Except");
  if (partialExcept) {
    const exclude = splitTrimSet(partialExcept);
    const result = {};
    for (const [k, v] of Object.entries(props)) {
      if (!exclude.has(k)) {
        result[k] = v;
      }
    }
    return result;
  }
  if (partialData) {
    const include = splitTrimSet(partialData);
    const result = {};
    for (const [k, v] of Object.entries(props)) {
      if (include.has(k)) {
        result[k] = v;
      }
    }
    return result;
  }
  return props;
}
function splitTrimSet(s) {
  const parts = s.split(",");
  const set = /* @__PURE__ */ new Set();
  for (const p of parts) {
    const trimmed = p.trim();
    if (trimmed) {
      set.add(trimmed);
    }
  }
  return set;
}

// src/redirect.ts
function redirect(res, url) {
  res.status(303).setHeader("Location", url).send();
}
function location(res, url) {
  res.setHeader("X-Inertia-Location", url).status(409).send();
}
function back(res, req, defaultUrl = "/") {
  const referer = req.header("Referer") || defaultUrl;
  redirect(res, referer);
}
function getReferer(req) {
  return req.header("Referer") || "";
}

// src/version.ts
var import_fs = require("fs");
function versionFromFile(path) {
  if (!(0, import_fs.existsSync)(path)) return "";
  return (0, import_fs.readFileSync)(path, "utf8").trim();
}
function versionFromEnv(key) {
  return process.env[key] || "";
}

// src/index.ts
var Inertia = class {
  version;
  renderFunc;
  sharedProps = [];
  title;
  favicon;
  csrf;
  devUrl;
  manifest;
  script;
  stylesheet;
  constructor(config = {}) {
    this.version = config.version || "";
    this.renderFunc = config.render;
    this.title = config.title || "Inertia";
    this.favicon = config.favicon;
    this.csrf = config.csrf;
    this.devUrl = config.devUrl;
    this.manifest = config.manifest;
    this.script = config.script || "/assets/main.js";
    this.stylesheet = config.stylesheet;
  }
  // -----------------------------------------------------------------------
  // Shared / global props
  // -----------------------------------------------------------------------
  /**
   * Register a static global prop included in every page render.
   * If a key is already registered, it is overwritten.
   * Page-specific props with the same key override shared props.
   */
  share(key, value) {
    this.removeShared(key);
    this.sharedProps.push({ key, value });
  }
  /**
   * Register a dynamic global prop resolved per-request.
   * The fn receives the HyperExpress Request and Response.
   */
  shareFunc(key, fn) {
    this.removeShared(key);
    this.sharedProps.push({ key, fn });
  }
  removeShared(key) {
    const idx = this.sharedProps.findIndex((sp) => sp.key === key);
    if (idx !== -1) {
      this.sharedProps.splice(idx, 1);
    }
  }
  // -----------------------------------------------------------------------
  // Core: Render
  // -----------------------------------------------------------------------
  /**
   * Send an Inertia-compatible response.
   *
   * For Inertia XHR requests: returns JSON page object.
   * For initial loads: returns root HTML with embedded page data.
   */
  async render(req, res, component, props = {}) {
    let filteredProps = props;
    if (isPartialRequest(req, component)) {
      filteredProps = filterPartialProps(props, req);
    }
    const mergedProps = this.mergeSharedProps(req, res, filteredProps);
    const url = req.url || "/";
    const page = {
      component,
      props: mergedProps,
      url,
      version: this.version || void 0
    };
    if (this.sharedProps.length > 0) {
      page.sharedProps = this.sharedProps.map((sp) => sp.key);
    }
    if (req.header("X-Inertia") === "true") {
      return this.renderJSON(res, page);
    }
    return this.renderHTML(req, res, page);
  }
  /**
   * Merge shared props with page-specific props.
   * Shared props are merged first, page-specific props override them.
   */
  mergeSharedProps(req, res, props) {
    const result = {};
    for (const sp of this.sharedProps) {
      if (sp.fn) {
        result[sp.key] = sp.fn(req, res);
      } else {
        result[sp.key] = sp.value;
      }
    }
    for (const [k, v] of Object.entries(props)) {
      result[k] = v;
    }
    return result;
  }
  // -----------------------------------------------------------------------
  // JSON response
  // -----------------------------------------------------------------------
  /**
   * Return the page object as JSON for Inertia XHR requests.
   */
  renderJSON(res, page) {
    res.setHeader("X-Inertia", "true");
    res.setHeader("X-Inertia-Version", this.version);
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    );
    res.setHeader("Vary", "X-Inertia");
    return res.json(page);
  }
  // -----------------------------------------------------------------------
  // HTML response
  // -----------------------------------------------------------------------
  /**
   * Render the root HTML page for initial full-page loads.
   * Uses Inertia v3 format:
   *   <div id="app"></div>
   *   <script data-page="app" type="application/json">{page}</script>
   *   <script type="module" src="..."></script>
   */
  async renderHTML(req, res, page) {
    if (this.renderFunc) {
      return this.renderFunc(req, res, page);
    }
    const pageJSON = JSON.stringify(page);
    const pageTitle = extractTitle(page.props, this.title);
    const isDev = !!this.devUrl;
    const resolveAsset = (file) => {
      if (isDev) return `${this.devUrl}/${file}`;
      const entry = this.manifest?.[file];
      if (!entry) return "/" + file;
      return "/" + entry.file;
    };
    const resolveCss = (file) => {
      if (isDev) return `${this.devUrl}/${file}`;
      const entry = this.manifest?.[file];
      if (entry?.css?.[0]) return "/" + entry.css[0];
      return "/" + file;
    };
    let csrfToken = "";
    if (this.csrf === true) {
      csrfToken = req.csrf_token || "";
    } else if (typeof this.csrf === "function") {
      csrfToken = this.csrf(req);
    }
    const headParts = [
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    ];
    headParts.push(`<title>${escapeHtml(pageTitle)}</title>`);
    if (this.favicon) {
      headParts.push(
        `<link rel="icon" type="image/x-icon" href="${escapeHtml(this.favicon)}">`
      );
    }
    if (csrfToken) {
      headParts.push(
        `<meta name="csrf-token" content="${escapeHtml(csrfToken)}">`
      );
    }
    if (isDev) {
      headParts.push(
        `<script type="module" src="${this.devUrl}/@vite/client"></script>`
      );
    }
    const headHtml = headParts.join("\n		");
    const bodyParts = [];
    bodyParts.push('<div id="app"></div>');
    bodyParts.push(
      `<script data-page="app" type="application/json">${pageJSON}</script>`
    );
    if (this.stylesheet) {
      bodyParts.push(
        `<link rel="stylesheet" href="${escapeHtml(resolveCss(this.stylesheet))}">`
      );
    }
    bodyParts.push(
      `<script type="module" src="${escapeHtml(resolveAsset(this.script))}"></script>`
    );
    const bodyHtml = bodyParts.join("\n		");
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
		${headHtml}
</head>
<body>
		${bodyHtml}
</body>
</html>`;
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    );
    res.setHeader("Vary", "X-Inertia");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }
  // -----------------------------------------------------------------------
  // Flash helper
  // -----------------------------------------------------------------------
  /**
   * Set a flash message cookie (one-time read, 5s TTL).
   * The cookie is read by the Inertia client on the next request
   * and passed to the page component as the `flash` prop.
   *
   * @example
   * ```ts
   * inertia.flash(res, "error", "Invalid credentials");
   * ```
   */
  flash(res, type, message) {
    res.cookie(type, message, 5e3);
  }
  // -----------------------------------------------------------------------
  // Redirect helpers
  // -----------------------------------------------------------------------
  /**
   * Internal redirect — 303 See Other for Inertia-aware redirects.
   */
  redirect(res, url) {
    redirect(res, url);
  }
  /**
   * External redirect — 409 + X-Inertia-Location.
   * Triggers full window.location navigation on the client.
   */
  location(res, url) {
    location(res, url);
  }
  /**
   * Back — navigate to previous page via Referer header.
   */
  back(res, req, defaultUrl = "/") {
    back(res, req, defaultUrl);
  }
};
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function extractTitle(props, fallback = "Inertia") {
  for (const key of ["_title", "title"]) {
    const v = props[key];
    if (typeof v === "string" && v) return v;
  }
  return fallback;
}
var index_default = Inertia;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Inertia,
  back,
  filterPartialProps,
  getReferer,
  isPartialRequest,
  location,
  redirect,
  versionFromEnv,
  versionFromFile
});
