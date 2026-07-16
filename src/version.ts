/**
 * Version helpers for asset versioning.
 *
 * Inertia uses an asset version string to detect when client-side assets
 * have changed. When the version mismatches, the server returns 409,
 * forcing a full page reload so the user gets the latest assets.
 */

import { readFileSync, existsSync } from "fs";

/**
 * Read the contents of a file as the version string, trimmed.
 * Returns empty string and no error if the file doesn't exist.
 */
export function versionFromFile(path: string): string {
	if (!existsSync(path)) return "";
	return readFileSync(path, "utf8").trim();
}

/**
 * Get the version from an environment variable.
 * Returns empty string if the variable is unset or empty.
 */
export function versionFromEnv(key: string): string {
	return process.env[key] || "";
}
