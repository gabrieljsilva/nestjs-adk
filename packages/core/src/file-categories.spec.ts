import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGES_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Every package whose sources carry a category. The playground is an application and does not. */
const PACKAGES = ["core", "google", "openai", "mcp", "testing"];

/**
 * The categories `.knowledge/file-categories.md` declares, and the only ones a file may end with.
 *
 * This list and that table are one rule written twice: a category added to the tree without a row
 * there makes the table stop being the index, so adding one here means editing the guideline in
 * the same change.
 */
const CATEGORIES = [
	"adapter",
	"codec",
	"command",
	"contract",
	"controller",
	"decorator",
	"double",
	"edge",
	"entity",
	"error",
	"event",
	"factory",
	"fixture",
	"mapper",
	"module",
	"notice",
	"options",
	"policy",
	"record",
	"service",
	"strategy",
	"support",
	"token",
	"tool",
	"use-case",
	"value-object",
];

/**
 * A barrel names a package rather than a thing, a declaration file is not ours to name, and a
 * spec already declares its category in the suffix that decides which project collects it.
 */
const isExempt = (name: string): boolean => name === "index.ts" || name.endsWith(".d.ts") || name.endsWith(".spec.ts");

const hasCategory = (name: string): boolean => CATEGORIES.some((category) => name.endsWith(`.${category}.ts`));

const typescriptFilesIn = async (directory: string): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) return typescriptFilesIn(path);
			return entry.name.endsWith(".ts") ? [path] : [];
		}),
	);
	return files.flat();
};

/**
 * Every file says what it holds, so moving one between folders cannot silently change its claim.
 *
 * The walk is asserted before the names are, because a path that stopped resolving would read as
 * a clean sweep of nothing.
 */
describe("file categories", () => {
	it("walks every package source tree", async () => {
		const files = await Promise.all(PACKAGES.map((name) => typescriptFilesIn(join(PACKAGES_ROOT, name, "src"))));

		for (const [index, found] of files.entries()) {
			expect(found.length, `${PACKAGES[index]} has no sources`).toBeGreaterThan(0);
		}
	});

	it("ends every file name with a known category", async () => {
		const trees = await Promise.all(PACKAGES.map((name) => typescriptFilesIn(join(PACKAGES_ROOT, name, "src"))));
		const files = trees.flat();
		expect(files.length).toBeGreaterThan(500);

		const uncategorized = files
			.filter((file) => {
				const name = file.slice(file.lastIndexOf("/") + 1);
				return !isExempt(name) && !hasCategory(name);
			})
			.map((file) => file.replace(PACKAGES_ROOT, ""));

		expect(uncategorized).toEqual([]);
	});
});
