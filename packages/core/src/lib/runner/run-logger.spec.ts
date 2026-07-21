import "reflect-metadata";
import { Injectable, Logger, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { z } from "zod";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { Agent } from "../decorators/agent.decorator";
import { Tool } from "../decorators/tool.decorator";
import { AdkModule } from "../module/adk.module";
import { ScriptedEngine, callTool, text } from "../testing/scripted-engine";
import type { LoggingOption } from "./run-logger";
import { RunLogger } from "./run-logger";

@Agent({ name: "logged_agent", description: "Agent under logging.", prompt: "You are logged." })
class LoggedAgent extends AdkAgent {
	@Tool({ description: "Echoes.", schema: z.object({ value: z.string() }) })
	echo(input: { value: string }) {
		return { echoed: input.value };
	}
}

@Injectable()
class UseCase {
	constructor(public readonly agent: LoggedAgent) {}
}

@Module({ providers: [LoggedAgent, UseCase] })
class FeatureModule {}

async function bootstrap(logging: LoggingOption) {
	const app = await Test.createTestingModule({
		imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test-model", logging }), FeatureModule],
	}).compile();
	await app.init();
	return app;
}

const RUN_LINE = /^(run start|run done|tool call|tool result|llm response|approval required|model rerouted)/;

describe("RunLogger", () => {
	let lines: string[];

	beforeEach(() => {
		lines = [];
		for (const level of ["log", "warn", "debug", "verbose"] as const) {
			vi.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
				lines.push(String(args[0]));
			});
		}
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function runLines(): string[] {
		return lines.filter((line) => RUN_LINE.test(line));
	}

	it("logging disabled → create returns undefined and nothing is logged", async () => {
		expect(RunLogger.create(undefined, "x")).toBeUndefined();
		expect(RunLogger.create(false, "x")).toBeUndefined();

		const app = await bootstrap(false);
		(app.get(AdkEngine) as ScriptedEngine).enqueue([text("hi")]);
		await app.get(UseCase).agent.ask({ message: "hello" });
		expect(runLines()).toEqual([]);
		await app.close();
	});

	it('"info" (and true): run start/done with tokens, WITHOUT tool details', async () => {
		const app = await bootstrap("info");
		(app.get(AdkEngine) as ScriptedEngine).enqueue([callTool("echo", { value: "hi" }), text("done!")]);

		await app.get(UseCase).agent.ask({ sessionId: "s1", userId: "u1", message: "please echo hi" });

		expect(runLines().some((line) => line.startsWith("run start session=s1 user=u1"))).toBe(true);
		expect(runLines().some((line) => line.startsWith("run done in") && line.includes("tokens in="))).toBe(true);
		expect(runLines().some((line) => line.startsWith("tool call"))).toBe(false);
		await app.close();
	});

	it('"debug": info + tool calls/results', async () => {
		const app = await bootstrap("debug");
		(app.get(AdkEngine) as ScriptedEngine).enqueue([callTool("echo", { value: "hi" }), text("done!")]);

		await app.get(UseCase).agent.ask({ message: "please echo hi" });

		expect(runLines().some((line) => line.startsWith("tool call echo") && line.includes('"value":"hi"'))).toBe(true);
		expect(runLines().some((line) => line.startsWith("tool result echo") && line.includes('"echoed":"hi"'))).toBe(true);
		await app.close();
	});

	it('"verbose" logs full payloads; lower levels truncate long ones', async () => {
		const long = "x".repeat(500);

		const app = await bootstrap("info");
		(app.get(AdkEngine) as ScriptedEngine).enqueue([text("ok")]);
		await app.get(UseCase).agent.ask({ message: long });
		expect(runLines().find((line) => line.startsWith("run start"))).toContain("... (+");
		await app.close();

		lines = [];
		const verboseApp = await bootstrap("verbose");
		(verboseApp.get(AdkEngine) as ScriptedEngine).enqueue([text("ok")]);
		await verboseApp.get(UseCase).agent.ask({ message: long });
		expect(runLines().find((line) => line.startsWith("run start"))).toContain(long);
		await verboseApp.close();
	});

	it("limit abort logs warn with duration/usage even at info level", async () => {
		const app = await bootstrap("info");
		(app.get(AdkEngine) as ScriptedEngine).enqueue([
			callTool("echo", { value: "a" }),
			callTool("echo", { value: "b" }),
			text("never"),
		]);

		await app
			.get(UseCase)
			.agent.ask({ message: "loop", maxIterations: 1 })
			.catch(() => undefined);

		const aborted = lines.find((line) => line.startsWith("run aborted"));
		expect(aborted).toContain("maxIterations (1)");
		expect(aborted).toContain('Last requested tool: "echo"');
		await app.close();
	});

	it('"debug": breaker escalation logs one line per counted failure', async () => {
		const app = await bootstrap("debug");
		vi.spyOn(app.get(LoggedAgent), "echo").mockImplementation(() => {
			throw new Error("down");
		});
		(app.get(AdkEngine) as ScriptedEngine).enqueue([callTool("echo", { value: "a" })]);

		await app
			.get(UseCase)
			.agent.ask({ message: "hi", maxConsecutiveToolFailures: 2 })
			.catch(() => undefined);

		expect(lines.some((line) => line.includes('tool "echo" failed (1/2 consecutive)'))).toBe(true);
		await app.close();
	});
});
