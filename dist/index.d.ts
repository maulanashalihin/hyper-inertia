import { Request, Response } from 'hyper-express';

/**
 * TypeScript types for the Inertia.js server-side adapter.
 *
 * Based on the Inertia v3 protocol specification:
 * https://inertiajs.com/the-protocol
 */

/**
 * Inertia Page object — serialised and sent to the client on every response.
 * https://inertiajs.com/the-protocol#the-page-object
 */
interface Page {
    /** The JavaScript page component name (e.g. "Dashboard") */
    component: string;
    /** Page data passed to the component */
    props: Record<string, unknown>;
    /** The current page URL */
    url: string;
    /** Current asset version identifier */
    version?: string;
    /** Encrypt the history entry (server-driven history encryption) */
    encryptHistory?: boolean;
    /** Clear history state on the client */
    clearHistory?: boolean;
    /** Props that should be merged (appended) rather than replaced */
    mergeProps?: string[];
    /** Props that should be prepended during navigation */
    prependProps?: string[];
    /** Props that should be deep merged during navigation */
    deepMergeProps?: string[];
    /** Controls how merge/prepend props are deduplicated */
    matchPropsOn?: string[];
    /** Infinite-scroll scroll position data */
    scrollProps?: Record<string, unknown>;
    /** Props that are resolved asynchronously on the client side */
    deferredProps?: Record<string, unknown>;
    /** Props that failed to resolve and were rescued server-side */
    rescuedProps?: string[];
    /** Top-level prop keys registered via Share */
    sharedProps?: string[];
    /** Props that resolve only once and are cached on the client */
    onceProps?: Record<string, unknown>;
}
/**
 * Shared prop registration — either a static value or a per-request function.
 */
interface SharedProp {
    key: string;
    value?: unknown;
    fn?: (req: Request, res: Response) => unknown;
}
/**
 * Vite manifest entry for production asset resolution.
 */
interface ViteManifestEntry {
    file: string;
    css?: string[];
}
/**
 * Inertia adapter configuration.
 */
interface InertiaConfig {
    /**
     * Current asset version. When the client sends a different
     * X-Inertia-Version header, a 409 Conflict is returned, triggering
     * a full page reload.
     *
     * Common values: file hash, git commit hash, build timestamp.
     * Leave empty to disable version checking.
     */
    version?: string;
    /**
     * Optional custom function to render the root HTML page for initial
     * (non-Inertia) page loads.
     *
     * When provided, this function receives the HyperExpress Request and
     * Response objects plus the serialised Page. It must call `res.send()`
     * with the full HTML document.
     *
     * When not provided, the DefaultRootTemplate is used:
     *   <div id="app" data-page='{pageJSON}'></div>
     *   <script type="module" src="/assets/main.js"></script>
     */
    render?: (req: Request, res: Response, page: Page) => Promise<void> | void;
    /**
     * Default page title fallback (when props._title or props.title is absent).
     * @default "Inertia"
     */
    title?: string;
    /**
     * Favicon href, e.g. "/favicon.ico". Omit for no favicon link.
     */
    favicon?: string;
    /**
     * CSRF token. Pass `true` to read from `req.csrf_token`,
     * or pass a function to provide a custom value.
     */
    csrf?: boolean | ((req: Request) => string);
    /**
     * Vite dev server URL (e.g. "http://localhost:5173").
     * When set, the template injects the Vite client and uses
     * dev URLs for script/stylesheet instead of production assets.
     */
    devUrl?: string;
    /**
     * Vite manifest for production asset resolution.
     * Load from `dist/.vite/manifest.json` in production.
     * Keys are source files (e.g. "src/app.js"), values contain
     * the hashed output `file` and optional `css` array.
     */
    manifest?: Record<string, ViteManifestEntry>;
    /**
     * JavaScript entry point (e.g. "src/app.js").
     * In dev mode: `{devUrl}/{script}`.
     * In production: resolved via `manifest[script].file`.
     * @default "/assets/main.js"
     */
    script?: string;
    /**
     * Stylesheet entry (e.g. "src/index.css").
     * In dev mode: `{devUrl}/{stylesheet}`.
     * In production: resolved via `manifest[stylesheet].file` or `manifest[stylesheet].css[0]`.
     * Omit for no stylesheet link.
     */
    stylesheet?: string;
}

/**
 * Redirect helpers for Inertia v3 protocol.
 *
 * Supports three types of redirects:
 * 1. Internal (303 See Other) — for form submissions within the app
 * 2. External (409 + X-Inertia-Location) — for full page navigations
 * 3. Back — navigate to previous page via Referer header
 */

/**
 * Inertia-aware redirect to an internal app route.
 *
 * Uses 303 See Other for POST/PUT/PATCH/DELETE to prevent duplicate
 * form submissions. The Inertia client intercepts the 303 and follows
 * it via GET XHR, maintaining SPA behaviour.
 */
declare function redirect(res: Response, url: string): void;
/**
 * Check if this response needs X-Inertia-Location redirect (external).
 * Sends 409 Conflict with X-Inertia-Location, causing the Inertia client
 * to perform a full window.location visit.
 */
declare function location(res: Response, url: string): void;
/**
 * Redirect to the previous page using the Referer header.
 * If no Referer is present, falls back to the given defaultURL ("/").
 */
declare function back(res: Response, req: Request, defaultUrl?: string): void;
/**
 * Get the Referer from the request.
 */
declare function getReferer(req: Request): string;

/**
 * Version helpers for asset versioning.
 *
 * Inertia uses an asset version string to detect when client-side assets
 * have changed. When the version mismatches, the server returns 409,
 * forcing a full page reload so the user gets the latest assets.
 */
/**
 * Read the contents of a file as the version string, trimmed.
 * Returns empty string and no error if the file doesn't exist.
 */
declare function versionFromFile(path: string): string;
/**
 * Get the version from an environment variable.
 * Returns empty string if the variable is unset or empty.
 */
declare function versionFromEnv(key: string): string;

/**
 * Partial reload support for Inertia v3.
 *
 * Inertia supports partial reloads — requesting a subset of props for the
 * same page component to avoid re-fetching expensive data on every visit.
 *
 * Headers (sent by the client):
 *   X-Inertia-Partial-Component  — the component name being partially reloaded
 *   X-Inertia-Partial-Data       — comma-separated props to INCLUDE (omit others)
 *   X-Inertia-Partial-Except     — comma-separated props to EXCLUDE (include rest)
 */

/**
 * Check if the request is a partial reload for the given component.
 */
declare function isPartialRequest(req: Request, component: string): boolean;
/**
 * Filter props according to partial reload headers.
 * Only the props matching the partial request are returned.
 */
declare function filterPartialProps(props: Record<string, unknown>, req: Request): Record<string, unknown>;

/**
 * hyper-express-inertia — Inertia.js v3 server-side adapter for HyperExpress.
 *
 * Implements the Inertia protocol natively on HyperExpress:
 *   - Auto-detects Inertia XHR vs initial full-page loads
 *   - JSON for Inertia requests, HTML for initial loads
 *   - Asset versioning (409 Conflict on version mismatch)
 *   - Shared / global props (static and per-request)
 *   - Partial reloads (X-Inertia-Partial-Data / Except)
 *   - Internal (303) and external (409+X-Inertia-Location) redirects
 *
 * @example
 * ```ts
 * import { Inertia } from "hyper-express-inertia";
 *
 * const inertia = new Inertia({ version: "1.0" });
 *
 * // In handlers
 * app.get("/", async (req, res) => {
 *   await inertia.render(req, res, "Home", { title: "Welcome" });
 * });
 * ```
 */

/**
 * Inertia adapter for HyperExpress.
 *
 * Create one via the constructor, register shared props, then use
 * `inertia.render()` and `inertia.flash()` in your handlers.
 */
declare class Inertia {
    private version;
    private renderFunc?;
    private sharedProps;
    private title;
    private favicon?;
    private csrf?;
    private devUrl?;
    private manifest?;
    private script;
    private stylesheet?;
    constructor(config?: InertiaConfig);
    /**
     * Register a static global prop included in every page render.
     * If a key is already registered, it is overwritten.
     * Page-specific props with the same key override shared props.
     */
    share(key: string, value: unknown): void;
    /**
     * Register a dynamic global prop resolved per-request.
     * The fn receives the HyperExpress Request and Response.
     */
    shareFunc(key: string, fn: (req: Request, res: Response) => unknown): void;
    private removeShared;
    /**
     * Send an Inertia-compatible response.
     *
     * For Inertia XHR requests: returns JSON page object.
     * For initial loads: returns root HTML with embedded page data.
     */
    render(req: Request, res: Response, component: string, props?: Record<string, unknown>): Promise<unknown>;
    /**
     * Merge shared props with page-specific props.
     * Shared props are merged first, page-specific props override them.
     */
    private mergeSharedProps;
    /**
     * Return the page object as JSON for Inertia XHR requests.
     */
    private renderJSON;
    /**
     * Render the root HTML page for initial full-page loads.
     * Uses Inertia v3 format:
     *   <div id="app"></div>
     *   <script data-page="app" type="application/json">{page}</script>
     *   <script type="module" src="..."></script>
     */
    private renderHTML;
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
    flash(res: Response, type: string, message: string): void;
    /**
     * Internal redirect — 303 See Other for Inertia-aware redirects.
     */
    redirect(res: Response, url: string): void;
    /**
     * External redirect — 409 + X-Inertia-Location.
     * Triggers full window.location navigation on the client.
     */
    location(res: Response, url: string): void;
    /**
     * Back — navigate to previous page via Referer header.
     */
    back(res: Response, req: Request, defaultUrl?: string): void;
}

export { Inertia, type InertiaConfig, type Page, type SharedProp, type ViteManifestEntry, back, Inertia as default, filterPartialProps, getReferer, isPartialRequest, location, redirect, versionFromEnv, versionFromFile };
