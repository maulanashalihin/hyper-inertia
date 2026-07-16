/**
 * Redirect helpers for Inertia v3 protocol.
 *
 * Supports three types of redirects:
 * 1. Internal (303 See Other) — for form submissions within the app
 * 2. External (409 + X-Inertia-Location) — for full page navigations
 * 3. Back — navigate to previous page via Referer header
 */

import type { Response, Request } from "hyper-express";

/**
 * Inertia-aware redirect to an internal app route.
 *
 * Uses 303 See Other for POST/PUT/PATCH/DELETE to prevent duplicate
 * form submissions. The Inertia client intercepts the 303 and follows
 * it via GET XHR, maintaining SPA behaviour.
 */
export function redirect(res: Response, url: string): void {
	res.status(303).setHeader("Location", url).send();
}

/**
 * Check if this response needs X-Inertia-Location redirect (external).
 * Sends 409 Conflict with X-Inertia-Location, causing the Inertia client
 * to perform a full window.location visit.
 */
export function location(res: Response, url: string): void {
	res.setHeader("X-Inertia-Location", url).status(409).send();
}

/**
 * Redirect to the previous page using the Referer header.
 * If no Referer is present, falls back to the given defaultURL ("/").
 */
export function back(res: Response, req: Request, defaultUrl = "/"): void {
	const referer = req.header("Referer") || defaultUrl;
	redirect(res, referer);
}

/**
 * Get the Referer from the request.
 */
export function getReferer(req: Request): string {
	return req.header("Referer") || "";
}
