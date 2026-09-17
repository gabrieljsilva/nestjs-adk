import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ToolSource } from "../../contracts/tool/tool-source.contract";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../domain/tool/tool-schema.contract";
import type { RunJournal } from "../run/journal/run-journal.service";
import type { RunScope } from "../run/scope/run-scope.value-object";
import type { RunProgress } from "../run/settle/run-progress.value-object";
import type { SessionRepository } from "../session/session-repository.service";
import { ToolService } from "./tool.service";

const SESSION = SessionId.from("s-1");
const RUN = AgentRunId.from("run-1");

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return {};
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({});
	}
}

class NoopHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return undefined;
	}
}

class CountingSource extends ToolSource {
	public opens = 0;
	public closes = 0;

	public constructor(public readonly name: string) {
		super();
	}

	public async open(): Promise<readonly ToolDefinition[]> {
		this.opens += 1;
		return [
			new ToolDefinition(`${this.name}_tool`, "a remote tool", new AnySchema(), ToolEffect.READ, new NoopHandler()),
		];
	}

	public async close(): Promise<void> {
		this.closes += 1;
	}
}

/** Fails the spec if the run ever commits, which is what "reports nothing" has to mean. */
const REFUSING_SESSIONS = {
	commit: () => {
		throw new Error("nothing should have been committed");
	},
} as unknown as SessionRepository;

const NO_JOURNAL = {} as RunJournal;

describe("ToolService", () => {
	it("offers the module's sources before the run's, so a run cannot shadow a declaration", async () => {
		const declared = new CountingSource("module");
		const perRun = new CountingSource("run");
		const service = new ToolService(REFUSING_SESSIONS, NO_JOURNAL, [declared]);

		const names = await service.withSources([perRun], RUN, async (sources) => sources.open(SESSION, RUN));

		expect(names.map((tool) => tool.name)).toEqual(["module_tool", "run_tool"]);
	});

	it("closes what opened once the body is done", async () => {
		const source = new CountingSource("module");

		await new ToolService(REFUSING_SESSIONS, NO_JOURNAL, [source]).withSources([], RUN, async (sources) => {
			await sources.open(SESSION, RUN);
		});

		expect(source.closes).toBe(1);
	});

	it("closes what opened when the body throws, which is the whole reason it exists", async () => {
		const source = new CountingSource("module");

		await expect(
			new ToolService(REFUSING_SESSIONS, NO_JOURNAL, [source]).withSources([], RUN, async (sources) => {
				await sources.open(SESSION, RUN);
				throw new Error("the run failed");
			}),
		).rejects.toThrow("the run failed");
		expect(source.closes).toBe(1);
	});

	it("answers with what the body answered", async () => {
		const service = new ToolService(REFUSING_SESSIONS, NO_JOURNAL);

		expect(await service.withSources([], RUN, async () => "done")).toBe("done");
	});

	it("writes nothing when every source let the runtime in", async () => {
		const service = new ToolService(REFUSING_SESSIONS, NO_JOURNAL, [new CountingSource("module")]);

		await service.withSources([], RUN, async (sources) => {
			await sources.open(SESSION, RUN);
			await service.recordUnauthorized({} as RunScope, {} as RunProgress, sources);
		});
	});
});
