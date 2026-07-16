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
import { readFileSync, existsSync } from "fs";
function versionFromFile(path) {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").trim();
}
function versionFromEnv(key) {
  return process.env[key] || "";
}

// src/index.ts
var DEFAULT_ROOT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>%s - Inertia</title>
</head>
<body>
    <div id="app" data-page='%s'></div>
    <script type="module" src="/assets/main.js"></script>
</body>
</html>`;
var Inertia = class {
  version;
  renderFunc;
  sharedProps = [];
  constructor(config = {}) {
    this.version = config.version || "";
    this.renderFunc = config.render;
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
  // Middleware
  // -----------------------------------------------------------------------
  /**
   * Returns a HyperExpress middleware handler that:
   *   1. Checks asset version (409 Conflict on mismatch)
   *   2. Sets Vary: X-Inertia header
   *   3. Attaches inertia/flash/redirect helpers to the response object
   */
  middleware() {
    return (req, res) => {
      if (this.version && req.header("X-Inertia") === "true") {
        const clientVersion = req.header("X-Inertia-Version");
        if (clientVersion && clientVersion !== this.version) {
          res.setHeader("X-Inertia-Location", req.url || "/");
          res.status(409).send();
          return;
        }
      }
      res.flash = (type, message, ttl = 3e3) => {
        res.cookie(type, message, ttl);
        return res;
      };
      res.redirect = (url, status = 303) => {
        return res.status(status).setHeader("Location", url).send();
      };
      res.inertia = async (component, inertiaProps = {}) => {
        return this.render(req, res, component, inertiaProps);
      };
    };
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
   */
  async renderHTML(req, res, page) {
    if (this.renderFunc) {
      return this.renderFunc(req, res, page);
    }
    const jsonStr = escapeHtml(JSON.stringify(page));
    const title = extractTitle(page.props);
    const html = DEFAULT_ROOT_TEMPLATE.replace("%s", title).replace(
      "%s",
      jsonStr
    );
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    );
    res.setHeader("Vary", "X-Inertia");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
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
function extractTitle(props) {
  for (const key of ["_title", "title"]) {
    const v = props[key];
    if (typeof v === "string" && v) return v;
  }
  return "Inertia";
}
var index_default = Inertia;
export {
  Inertia,
  back,
  index_default as default,
  filterPartialProps,
  getReferer,
  isPartialRequest,
  location,
  redirect,
  versionFromEnv,
  versionFromFile
};
