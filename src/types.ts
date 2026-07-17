/**
 * TypeScript types for the Inertia.js server-side adapter.
 *
 * Based on the Inertia v3 protocol specification:
 * https://inertiajs.com/the-protocol
 */

import type { Request, Response } from "hyper-express";

// ---------------------------------------------------------------------------
// Page object
// ---------------------------------------------------------------------------

/**
 * Inertia Page object — serialised and sent to the client on every response.
 * https://inertiajs.com/the-protocol#the-page-object
 */
export interface Page {
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Shared prop registration — either a static value or a per-request function.
 */
export interface SharedProp {
	key: string;
	value?: unknown;
	fn?: (req: Request, res: Response) => unknown;
}

/**
 * Vite manifest entry for production asset resolution.
 */
export interface ViteManifestEntry {
	file: string;
	css?: string[];
}

/**
 * Inertia adapter configuration.
 */
export interface InertiaConfig {
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

	// -------------------------------------------------------------------
	// Built-in template customization
	// -------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Response augmentation for HyperExpress
// ---------------------------------------------------------------------------


