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
}

// ---------------------------------------------------------------------------
// Response augmentation for HyperExpress
// ---------------------------------------------------------------------------

/**
 * Augment HyperExpress Response with Inertia helpers.
 * These are attached by the middleware — TypeScript users import this
 * interface for type augmentation.
 */
export interface InertiaResponseExtensions {
	/**
	 * Render an Inertia page (JSON for XHR, HTML for initial load).
	 */
	inertia: (
		component: string,
		props?: Record<string, unknown>,
	) => Promise<unknown>;

	/**
	 * Set a flash message cookie (one-time read).
	 */
	flash: (type: string, message: string, ttl?: number) => Response;

	/**
	 * Inertia-aware redirect (303 See Other).
	 */
	redirect: (url: string, status?: number) => Response;
}
