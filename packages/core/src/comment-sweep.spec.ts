import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGES_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Every published package. The playground is an application and writes what it likes. */
const PACKAGES = ["core", "google", "openai", "mcp", "testing"];

/**
 * The magic values `.knowledge/comments-and-jsdoc.md` allows a comment on, by file and by a
 * fragment of the line. Each one survived the question the guideline asks first: a rename could
 * not carry it, because what it says is an external constraint rather than a name.
 *
 * Adding a row here is adding a comment to the lib, and needs the same answer.
 */
const ALLOWED_LINE_COMMENTS: Record<string, readonly string[]> = {
	"core/src/common/secrecy/secret.value-object.ts": ["Node's inspect hook"],
	"core/src/domain/context/media-splitter.service.ts": ["A tool role carries text only"],
	"core/src/domain/context/window-share-compaction.policy.ts": ["The shares Cline and Cursor"],
	"core/src/domain/cost/token-rate.value-object.ts": ["Rounding to nearest"],
	"core/src/domain/model/messages/media-part.value-object.ts": [
		"URL keeps an IPv6 host in brackets",
		"canonicalizes an IPv4-mapped IPv6 host",
		"Decoders accept stray characters",
	],
	"core/src/domain/model/usage/projected-media-cost.value-object.ts": ["The band the providers bill"],
	"core/src/domain/prompt/prompt-template.value-object.ts": ["The required form comes first"],
	"core/src/domain/prompt/errors/prompt-not-found.error.ts": ["every `Error` already owns that property"],
};

/**
 * The contract members whose obligation the signature cannot carry: when the method is called,
 * what it is allowed to answer, and what an implementer has to do about it. Everywhere else an
 * indented JSDoc block documents a member nobody outside implements, and is deleted.
 */
const ALLOWED_MEMBER_DOCS: Record<string, number> = {
	"core/src/common/time/clock.contract.ts": 1,
	"core/src/contracts/context/compaction-strategy.contract.ts": 1,
	"core/src/contracts/model/embedder.contract.ts": 1,
	"core/src/contracts/model/prompt-source.contract.ts": 2,
	"core/src/contracts/storage/artifact-storage.contract.ts": 3,
	"core/src/contracts/storage/session-storage.contract.ts": 2,
	"core/src/contracts/storage/storage-capabilities.value-object.ts": 1,
	"core/src/contracts/tool/tool-source.contract.ts": 1,
};

const sourceFilesIn = async (directory: string): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) return sourceFilesIn(path);
			return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts") ? [path] : [];
		}),
	);
	return files.flat();
};

const walkPackages = async (): Promise<string[]> => {
	const trees = await Promise.all(PACKAGES.map((name) => sourceFilesIn(join(PACKAGES_ROOT, name, "src"))));
	return trees.flat();
};

const relative = (file: string): string => file.replace(PACKAGES_ROOT, "");

const linesOf = async (file: string): Promise<string[]> => (await readFile(file, "utf8")).split("\n");

/**
 * A comment is forbidden, and the two exceptions are counted rather than trusted.
 *
 * The walk is asserted before the comments are, because a path that stopped resolving would read
 * as a clean sweep of nothing.
 */
describe("comment sweep", () => {
	it("walks every published package source tree", async () => {
		const files = await walkPackages();
		expect(files.length).toBeGreaterThan(500);

		for (const name of PACKAGES) {
			expect(
				files.some((file) => relative(file).startsWith(`${name}/src/`)),
				`${name} has no sources`,
			).toBe(true);
		}
	});

	it("narrates nothing outside the allowed magic values", async () => {
		const files = await walkPackages();
		const narration: string[] = [];

		for (const file of files) {
			const name = relative(file);
			const allowed = ALLOWED_LINE_COMMENTS[name] ?? [];
			for (const [index, line] of (await linesOf(file)).entries()) {
				if (!/^\s*\/\//.test(line)) continue;
				if (allowed.some((fragment) => line.includes(fragment))) continue;
				narration.push(`${name}:${index + 1}: ${line.trim()}`);
			}
		}

		expect(narration).toEqual([]);
	});

	it("documents no member outside the contracts whose obligation the signature cannot carry", async () => {
		const files = await walkPackages();
		const documented: Record<string, number> = {};

		for (const file of files) {
			const blocks = (await linesOf(file)).filter((line) => /^\s+\/\*\*/.test(line)).length;
			if (blocks > 0) documented[relative(file)] = blocks;
		}

		expect(documented).toEqual(ALLOWED_MEMBER_DOCS);
	});
});
