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

import type { Request } from "hyper-express";

/**
 * Check if the request is a partial reload for the given component.
 */
export function isPartialRequest(req: Request, component: string): boolean {
	return req.header("X-Inertia-Partial-Component") === component;
}

/**
 * Filter props according to partial reload headers.
 * Only the props matching the partial request are returned.
 */
export function filterPartialProps(
	props: Record<string, unknown>,
	req: Request,
): Record<string, unknown> {
	const partialData = req.header("X-Inertia-Partial-Data");
	const partialExcept = req.header("X-Inertia-Partial-Except");

	// 1. X-Inertia-Partial-Except — remove these keys, keep everything else.
	if (partialExcept) {
		const exclude = splitTrimSet(partialExcept);
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(props)) {
			if (!exclude.has(k)) {
				result[k] = v;
			}
		}
		return result;
	}

	// 2. X-Inertia-Partial-Data — keep only these keys.
	if (partialData) {
		const include = splitTrimSet(partialData);
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(props)) {
			if (include.has(k)) {
				result[k] = v;
			}
		}
		return result;
	}

	return props;
}

/**
 * Split a comma-separated string into a Set of trimmed strings.
 */
function splitTrimSet(s: string): Set<string> {
	const parts = s.split(",");
	const set = new Set<string>();
	for (const p of parts) {
		const trimmed = p.trim();
		if (trimmed) {
			set.add(trimmed);
		}
	}
	return set;
}
