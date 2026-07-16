/**
 * @maulanashalihin/hyper-inertia — Inertia.js v3 server-side adapter for HyperExpress.
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
 * import { Inertia } from "@maulanashalihin/hyper-inertia";
 *
 * const inertia = new Inertia({ version: "1.0" });
 *
 * // As middleware
 * server.use(inertia.middleware());
 *
 * // In handlers
 * app.get("/", async (req, res) => {
 *   await inertia.render(req, res, "Home", { title: "Welcome" });
 * });
 * ```
 */

import type { Request, Response } from "hyper-express";
import type { InertiaConfig, Page, InertiaResponseExtensions } from "./types";
import { isPartialRequest, filterPartialProps } from "./partial";
import { redirect, location, back } from "./redirect";

// ---------------------------------------------------------------------------
// Shared prop type
// ---------------------------------------------------------------------------
interface SharedProp {
	key: string;
	value?: unknown;
	fn?: (req: Request, res: Response) => unknown;
}

// ---------------------------------------------------------------------------
// Default root template
// ---------------------------------------------------------------------------

/**
 * Default HTML root template used when no custom render function is provided.
 *
 * Placeholders:
 *   %s — page title (from props["_title"] or "Inertia")
 *   %s — JSON-encoded page object (HTML-escaped for data-page attribute)
 */
const DEFAULT_ROOT_TEMPLATE = `<!DOCTYPE html>
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

// ---------------------------------------------------------------------------
// Inertia class
// ---------------------------------------------------------------------------

/**
 * Inertia adapter for HyperExpress.
 *
 * Create one via the constructor, register shared props, then use
 * `middleware()` and `render()` in your routes.
 */
export class Inertia {
	private version: string;
	private renderFunc?: (
		req: Request,
		res: Response,
		page: Page,
	) => Promise<void> | void;
	private sharedProps: SharedProp[] = [];

	constructor(config: InertiaConfig = {}) {
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
	share(key: string, value: unknown): void {
		this.removeShared(key);
		this.sharedProps.push({ key, value });
	}

	/**
	 * Register a dynamic global prop resolved per-request.
	 * The fn receives the HyperExpress Request and Response.
	 */
	shareFunc(key: string, fn: (req: Request, res: Response) => unknown): void {
		this.removeShared(key);
		this.sharedProps.push({ key, fn });
	}

	private removeShared(key: string): void {
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
	middleware(): (req: Request, res: Response) => Promise<void> | void {
		return (req: Request, res: Response) => {
			// --- Version check ---
			if (this.version && req.header("X-Inertia") === "true") {
				const clientVersion = req.header("X-Inertia-Version");
				if (clientVersion && clientVersion !== this.version) {
					res.setHeader("X-Inertia-Location", req.url || "/");
					res.status(409).send();
					return;
				}
			}

			// --- Attach helpers to response ---

			// Flash message
			(res as unknown as InertiaResponseExtensions).flash = (
				type: string,
				message: string,
				ttl = 3000,
			): Response => {
				// HyperExpress cookie format: name, value, maxAge (ms)
				// We use the cookie helper from hyper-express
				(res as any).cookie(type, message, ttl);
				return res;
			};

			// Redirect — wraps the redirect helper
			(res as unknown as InertiaResponseExtensions).redirect = (
				url: string,
				status = 303,
			): Response => {
				return res.status(status).setHeader("Location", url).send();
			};

			// Inertia render method
			(res as unknown as InertiaResponseExtensions).inertia = async (
				component: string,
				inertiaProps: Record<string, unknown> = {},
			): Promise<unknown> => {
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
	async render(
		req: Request,
		res: Response,
		component: string,
		props: Record<string, unknown> = {},
	): Promise<unknown> {
		// Apply partial reload filtering to page-specific props
		let filteredProps = props;
		if (isPartialRequest(req, component)) {
			filteredProps = filterPartialProps(props, req);
		}

		// Merge shared props (shared first, page-specific override)
		const mergedProps = this.mergeSharedProps(req, res, filteredProps);

		const url = req.url || "/";

		const page: Page = {
			component,
			props: mergedProps,
			url,
			version: this.version || undefined,
		};

		// Include shared props keys for the client (instant visits)
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
	private mergeSharedProps(
		req: Request,
		res: Response,
		props: Record<string, unknown>,
	): Record<string, unknown> {
		const result: Record<string, unknown> = {};

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
	private renderJSON(res: Response, page: Page): unknown {
		res.setHeader("X-Inertia", "true");
		res.setHeader("X-Inertia-Version", this.version);
		res.setHeader(
			"Cache-Control",
			"no-store, no-cache, must-revalidate, private",
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
	private async renderHTML(
		req: Request,
		res: Response,
		page: Page,
	): Promise<unknown> {
		if (this.renderFunc) {
			return this.renderFunc(req, res, page);
		}

		const jsonStr = escapeHtml(JSON.stringify(page));
		const title = extractTitle(page.props);

		const html = DEFAULT_ROOT_TEMPLATE.replace("%s", title).replace(
			"%s",
			jsonStr,
		);

		res.setHeader(
			"Cache-Control",
			"no-store, no-cache, must-revalidate, private",
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
	redirect(res: Response, url: string): void {
		redirect(res, url);
	}

	/**
	 * External redirect — 409 + X-Inertia-Location.
	 * Triggers full window.location navigation on the client.
	 */
	location(res: Response, url: string): void {
		location(res, url);
	}

	/**
	 * Back — navigate to previous page via Referer header.
	 */
	back(res: Response, req: Request, defaultUrl = "/"): void {
		back(res, req, defaultUrl);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape HTML characters for safe embedding in data-page='...' attribute.
 */
function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/'/g, "&#39;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/**
 * Extract the page title from props.
 * Checks "_title" key first, then "title", then falls back to "Inertia".
 */
function extractTitle(props: Record<string, unknown>): string {
	for (const key of ["_title", "title"]) {
		const v = props[key];
		if (typeof v === "string" && v) return v;
	}
	return "Inertia";
}

// Re-export types and helpers
export type {
	Page,
	InertiaConfig,
	InertiaResponseExtensions,
	SharedProp,
} from "./types";
export { redirect, location, back, getReferer } from "./redirect";
export { versionFromFile, versionFromEnv } from "./version";
export { isPartialRequest, filterPartialProps } from "./partial";

// Default export
export default Inertia;
