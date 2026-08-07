import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = fileURLToPath(new URL(".", import.meta.url));

/** Every sibling package. The core is the one nobody upstream is allowed to be. */
const SIBLING_PACKAGES = ["@nestjs-adk/google", "@nestjs-adk/openai", "@nestjs-adk/mcp", "@nestjs-adk/testing"];

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
 * The core prices, runs and stores without knowing who serves a model.
 *
 * Pricing is where this is easiest to break: a resolver that had to map our provider names onto the
 * catalog's prefixes would want to import the adapters to ask them what they are called. It
 * resolves by descriptor instead, and this is the test that keeps that true.
 */
describe("core package boundaries", () => {
	it("imports no sibling package", async () => {
		const files = await typescriptFilesIn(SOURCE_ROOT);
		const offenders: string[] = [];

		for (const file of files) {
			if (file === fileURLToPath(import.meta.url)) continue;
			const source = await readFile(file, "utf8");
			for (const sibling of SIBLING_PACKAGES) {
				if (source.includes(`"${sibling}`)) offenders.push(`${file.replace(SOURCE_ROOT, "")} imports ${sibling}`);
			}
		}

		expect(offenders).toEqual([]);
	});
});
