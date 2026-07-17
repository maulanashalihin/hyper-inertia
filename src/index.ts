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

import type { Request, Response } from "hyper-express";
import type { InertiaConfig, Page, ViteManifestEntry } from "./types";
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
// Inertia class
// ---------------------------------------------------------------------------

/**
 * Inertia adapter for HyperExpress.
 *
 * Create one via the constructor, register shared props, then use
 * `inertia.render()` and `inertia.flash()` in your handlers.
 */
export class Inertia {
	private version: string;
	private renderFunc?: (
		req: Request,
		res: Response,
		page: Page,
	) => Promise<void> | void;
	private sharedProps: SharedProp[] = [];
	private title: string;
	private favicon?: string;
	private csrf?: boolean | ((req: Request) => string);
	private devUrl?: string;
	private manifest?: Record<string, ViteManifestEntry>;
	private script: string;
	private stylesheet?: string;

	constructor(config: InertiaConfig = {}) {
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
	 * Uses Inertia v3 format:
	 *   <div id="app"></div>
	 *   <script data-page="app" type="application/json">{page}</script>
	 *   <script type="module" src="..."></script>
	 */
	private async renderHTML(
		req: Request,
		res: Response,
		page: Page,
	): Promise<unknown> {
		if (this.renderFunc) {
			return this.renderFunc(req, res, page);
		}

		const pageJSON = JSON.stringify(page);
		const pageTitle = extractTitle(page.props, this.title);

		// Resolve script/stylesheet URLs (dev vs production)
		const isDev = !!this.devUrl;
		const resolveAsset = (file: string): string => {
			if (isDev) return `${this.devUrl}/${file}`;
			const entry = this.manifest?.[file];
			if (!entry) return "/" + file;
			return "/" + entry.file;
		};
		const resolveCss = (file: string): string => {
			if (isDev) return `${this.devUrl}/${file}`;
			const entry = this.manifest?.[file];
			if (entry?.css?.[0]) return "/" + entry.css[0];
			return "/" + file;
		};

		// CSRF token
		let csrfToken = "";
		if (this.csrf === true) {
			csrfToken = (req as any).csrf_token || "";
		} else if (typeof this.csrf === "function") {
			csrfToken = this.csrf(req);
		}

		// Build HTML
		const headParts: string[] = [
			'<meta charset="UTF-8">',
			'<meta name="viewport" content="width=device-width, initial-scale=1.0">',
		];

		headParts.push(`<title>${escapeHtml(pageTitle)}</title>`);

		if (this.favicon) {
			headParts.push(
				`<link rel="icon" type="image/x-icon" href="${escapeHtml(this.favicon)}">`,
			);
		}

		if (csrfToken) {
			headParts.push(
				`<meta name="csrf-token" content="${escapeHtml(csrfToken)}">`,
			);
		}

		// Vite client (dev only)
		if (isDev) {
			headParts.push(
				`<script type="module" src="${this.devUrl}/@vite/client"></script>`,
			);
		}

		const headHtml = headParts.join("\n\t\t");

		// Build body parts (v3 format: empty div + JSON script + CSS + JS)
		const bodyParts: string[] = [];

		bodyParts.push('<div id="app"></div>');

		// Inertia v3: page data in type="application/json" script tag
		bodyParts.push(
			`<script data-page="app" type="application/json">${pageJSON}</script>`,
		);

		// Stylesheet (between JSON data and JS for progressive loading)
		if (this.stylesheet) {
			bodyParts.push(
				`<link rel="stylesheet" href="${escapeHtml(resolveCss(this.stylesheet))}">`,
			);
		}

		// JS entry
		bodyParts.push(
			`<script type="module" src="${escapeHtml(resolveAsset(this.script))}"></script>`,
		);

		const bodyHtml = bodyParts.join("\n\t\t");

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
			"no-store, no-cache, must-revalidate, private",
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
	flash(res: Response, type: string, message: string): void {
		(res as any).cookie(type, message, 5000);
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
 * Checks "_title" key first, then "title", then falls back to `fallback`.
 */
function extractTitle(
	props: Record<string, unknown>,
	fallback = "Inertia",
): string {
	for (const key of ["_title", "title"]) {
		const v = props[key];
		if (typeof v === "string" && v) return v;
	}
	return fallback;
}

// Re-export types and helpers
export type {
	Page,
	InertiaConfig,
	SharedProp,
	ViteManifestEntry,
} from "./types";
export { redirect, location, back, getReferer } from "./redirect";
export { versionFromFile, versionFromEnv } from "./version";
export { isPartialRequest, filterPartialProps } from "./partial";

// Default export
export default Inertia;
