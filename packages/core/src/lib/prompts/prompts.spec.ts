import "reflect-metadata";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { Agent } from "../decorators/agent.decorator";
import { AdkModule } from "../module/adk.module";
import { ScriptedEngine, text } from "../testing/scripted-engine";
import { AdkPrompt, type PromptContext } from "./adk-prompt";
import { PromptFiles } from "./prompt-files";

const promptsDir = mkdtempSync(join(tmpdir(), "adk-prompt-system-"));
writeFileSync(join(promptsDir, "greeting.prompt.md"), "Hello {{name}}, welcome to {{store}}.");
writeFileSync(join(promptsDir, "cached.prompt.md"), "first version");

describe("PromptFiles", () => {
	const files = new PromptFiles();

	it("resolvePath: plain → prompts.dir (subfolders included); default dir is ./prompts", () => {
		expect(files.resolvePath("a.md", "/base")).toBe("/base/a.md");
		expect(files.resolvePath("agents/support/main.md", "/base")).toBe("/base/agents/support/main.md");
		expect(files.resolvePath("a.md")).toBe(join("./prompts", "a.md"));
	});

	it("resolvePath: './'/'../' use callerDir; absolute stays as-is", () => {
		expect(files.resolvePath("./x.md", "/base", "/caller/dir")).toBe("/caller/dir/x.md");
		expect(files.resolvePath("../x.md", "/base", "/caller/dir")).toBe("/caller/x.md");
		// no callerDir known → falls back to prompts.dir join
		expect(files.resolvePath("./x.md", "/base")).toBe(resolve("/base/x.md"));
		expect(files.resolvePath("/abs/x.md", "/base", "/caller")).toBe("/abs/x.md");
	});

	it("interpolate: replaces {{vars}}, missing keys become empty", () => {
		expect(files.interpolate("Hi {{a}} {{b}}!", { a: "x" })).toBe("Hi x !");
		expect(files.interpolate("{{n}} + {{n}}", { n: 2 })).toBe("2 + 2");
	});

	it("render: reads, interpolates and CACHES (edits after first read are not re-read)", async () => {
		const first = await files.render("greeting.prompt.md", { promptsDir, vars: { name: "Ana", store: "ACME" } });
		expect(first).toBe("Hello Ana, welcome to ACME.");

		await files.render("cached.prompt.md", { promptsDir });
		writeFileSync(join(promptsDir, "cached.prompt.md"), "second version");
		expect(await files.render("cached.prompt.md", { promptsDir })).toBe("first version");
	});

	it("render: missing file → error with the resolved path", async () => {
		await expect(files.render("ghost.prompt.md", { promptsDir })).rejects.toThrow(/ghost\.prompt\.md/);
	});

	it("callerDir: points at THIS spec's directory", () => {
		expect(files.callerDir()).toBe(__dirname);
	});
});

// --- AdkPrompt.fromFile ------------------------------------------------------

@Injectable()
class RelativePrompt extends AdkPrompt {
	// "./" resolves relative to THIS file — fixtures live next to the spec
	build(ctx: PromptContext) {
		return this.fromFile("./fixtures/support.prompt.md", { tone: ctx.attributes.tone ?? "neutral" });
	}
}

@Injectable()
class AsyncGlobalPrompt extends AdkPrompt {
	async build() {
		await Promise.resolve();
		return this.fromFile("greeting.prompt.md", { name: "Bob", store: "ACME" });
	}
}

@Agent({ name: "relative_agent", model: "m", description: "d", prompt: RelativePrompt })
class RelativeAgent extends AdkAgent {}

@Agent({ name: "async_agent", model: "m", description: "d", prompt: AsyncGlobalPrompt })
class AsyncAgent extends AdkAgent {}

// promptFile with "./" — normalized to absolute at DECORATION time, relative to this file
@Agent({ name: "file_agent", model: "m", description: "d", promptFile: "./fixtures/static-agent.prompt.md" })
class FileAgent extends AdkAgent {}

@Module({ providers: [RelativePrompt, AsyncGlobalPrompt, RelativeAgent, AsyncAgent, FileAgent] })
class PromptsModule {}

describe("prompt system through a real run", () => {
	async function runAndGetInstruction(agentType: new (...args: never[]) => AdkAgent) {
		const app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "m", prompts: { dir: promptsDir } }),
				PromptsModule,
			],
		}).compile();
		await app.init();

		const engine = app.get(AdkEngine) as ScriptedEngine;
		engine.enqueue([text("ok")]);
		await app.get(agentType).ask({ message: "?", attributes: { tone: "formal" } });
		const instruction = engine.lastAgent?.instruction;
		await app.close();
		return instruction;
	}

	it("AdkPrompt with './' file resolves relative to the PROMPT CLASS file + run attributes interpolated", async () => {
		expect(await runAndGetInstruction(RelativeAgent)).toBe("Relative support prompt. Tone: formal.");
	});

	it("async build() with a prompts.dir file", async () => {
		expect(await runAndGetInstruction(AsyncAgent)).toBe("Hello Bob, welcome to ACME.");
	});

	it("promptFile with './' on @Agent reads the file next to the agent's file, verbatim", async () => {
		expect(await runAndGetInstruction(FileAgent)).toBe("Agent-relative file prompt.");
	});
});
