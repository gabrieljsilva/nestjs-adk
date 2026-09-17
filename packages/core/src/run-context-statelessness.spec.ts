import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = fileURLToPath(new URL(".", import.meta.url));

/** The values that are one invocation: they hold a context because they die with it. */
const ALLOWED = [
	"runtime/run/scope/run-scope.value-object.ts",
	"runtime/tool/tool-execution.command.ts",
	"runtime/context/prepare-context.command.ts",
	"runtime/model/model-run.command.ts",
];

/** A field declaration whose type is a context, in either the constructor or the body. */
const FIELD = /(?:public|private|protected|readonly)[^;()\n]*:\s*(?:RunContext|SessionContext)\b/;

const typescriptFilesIn = async (directory: string): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) return typescriptFilesIn(path);
			return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts") ? [path] : [];
		}),
	);
	return files.flat();
};

/**
 * A service receives the context and forgets it, which is what keeps the lib stateless.
 *
 * Two runs share one service instance, so a context kept in a field is one run reading what
 * another run is doing. The exceptions are the values that *are* one run: a scope, a tool call
 * and a prepared context all live and die inside the invocation they describe.
 */
describe("run context statelessness", () => {
	it("keeps a context out of every field the runtime holds", async () => {
		const files = await typescriptFilesIn(join(SOURCE_ROOT, "runtime"));
		const offenders: string[] = [];

		for (const file of files) {
			const relative = file.replace(SOURCE_ROOT, "");
			if (ALLOWED.includes(relative)) continue;
			const source = await readFile(file, "utf8");
			for (const line of source.split("\n")) {
				if (FIELD.test(line)) offenders.push(`${relative}: ${line.trim()}`);
			}
		}

		expect(offenders).toEqual([]);
	});
});
