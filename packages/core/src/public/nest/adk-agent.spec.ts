import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { PromptSource } from "../../contracts/prompt-source";
import { AgentName } from "../../domain/agent/agent-name";
import { MediaPart } from "../../domain/model/media-part";
import { PromptContext } from "../../domain/prompt/prompt-context";
import { AgentResult } from "../../domain/session/agent-result";
import { AgentRunStatus } from "../../domain/session/agent-run-status";
import type { ApproveInput } from "../../domain/session/approve-input";
import type { RejectInput } from "../../domain/session/reject-input";
import type { RuntimeServices } from "../../runtime/composition/runtime-services";
import type { AgentRunCommand } from "../../runtime/run/agent-run-command";
import { AdkAgent } from "./adk-agent";
import { AgentHandle } from "./agent-handle";
import { AgentPrompting } from "./agent-prompting";
import { AgentNotBoundError } from "./errors/agent-not-bound.error";

const SUPPORT = AgentName.from("support");
const PIXEL = "iVBORw0KGgo=";

/** Reaches the two protected members, which is what the runtime does through reflection. */
class SupportAgent extends AdkAgent {
	public buildPrompt(): Promise<string | undefined> {
		return this.prompt(new PromptContext(SessionId.from("s-1"), AgentRunId.from("r-1"), SUPPORT));
	}

	public reachPrompting(): AgentPrompting {
		return this.prompting;
	}
}

class EmptyPrompts extends PromptSource {
	public async load(): Promise<string | undefined> {
		return undefined;
	}
}

/** Keeps the command instead of running it, which is what these cases are about. */
class RecordingRunner {
	public readonly commands: AgentRunCommand[] = [];
	public readonly decisions: { by?: string; reason?: string }[] = [];

	public async ask(command: AgentRunCommand): Promise<AgentResult> {
		this.commands.push(command);
		return new AgentResult(SessionId.from("s-1"), AgentRunId.from(command.agent.value), AgentRunStatus.COMPLETED, "ok");
	}

	public async approve(input: ApproveInput): Promise<AgentResult> {
		this.decisions.push({ by: input.approvedBy, reason: undefined });
		return new AgentResult(SessionId.from("s-1"), AgentRunId.from("r-1"), AgentRunStatus.COMPLETED, "approved");
	}

	public async reject(input: RejectInput): Promise<AgentResult> {
		this.decisions.push({ by: input.deniedBy, reason: input.reason });
		return new AgentResult(SessionId.from("s-1"), AgentRunId.from("r-1"), AgentRunStatus.COMPLETED, "rejected");
	}
}

function boundAgent(): { agent: SupportAgent; runner: RecordingRunner } {
	const runner = new RecordingRunner();
	const runtime: RuntimeServices = Object.assign(Object.create(null), { runner });
	const agent = new SupportAgent();
	agent.bindTo(new AgentHandle(SUPPORT, runtime));
	return { agent, runner };
}

describe("AdkAgent", () => {
	it("asks as itself, without the caller knowing a registry exists", async () => {
		const { agent, runner } = boundAgent();

		const result = await agent.ask("hi");

		expect(result.text).toBe("ok");
		expect(runner.commands[0]?.input.message).toBe("hi");
	});

	it("carries a session and an attachment through the options", async () => {
		const { agent, runner } = boundAgent();

		await agent.ask("what is this?", {
			sessionId: "s-9",
			media: [MediaPart.image("image/png", PIXEL)],
		});

		expect(runner.commands[0]?.input.sessionId?.value).toBe("s-9");
		expect(runner.commands[0]?.input.attachments).toHaveLength(1);
	});

	it("still takes a session id on its own, which is the common case", async () => {
		const { agent, runner } = boundAgent();

		await agent.ask("and then?", SessionId.from("s-2"));

		expect(runner.commands[0]?.input.sessionId?.value).toBe("s-2");
	});

	it("answers which agent it is", () => {
		expect(boundAgent().agent.agentName.value).toBe("support");
	});

	it("delegates the decisions a conversation needs to the same handle", async () => {
		const { agent } = boundAgent();

		expect((await agent.approve("s-1", ToolCallId.from("c-1"))).text).toBe("approved");
	});

	it("refuses every verb until the module bound it", async () => {
		const agent = new SupportAgent();

		await expect(agent.ask("hi")).rejects.toBeInstanceOf(AgentNotBoundError);
		expect(() => agent.agentName).toThrow(AgentNotBoundError);
	});

	it("carries the session owner through the options, since the session is what remembers it", async () => {
		const { agent, runner } = boundAgent();

		await agent.ask("hi", { owner: "user-7" });

		expect(runner.commands[0]?.owner?.value).toBe("user-7");
	});

	/** The sources a suspended run had were closed when it suspended, so a decision declares them again. */
	it("reaches the decision options, sources included", async () => {
		const { agent, runner } = boundAgent();

		await agent.approve("s-1", ToolCallId.from("c-1"), { by: "gabriel", sources: [] });
		await agent.reject("s-1", ToolCallId.from("c-2"), "not this one", { by: "gabriel" });

		expect(runner.decisions).toEqual([
			{ by: "gabriel", reason: undefined },
			{ by: "gabriel", reason: "not this one" },
		]);
	});

	it("still takes a name on its own where the options object goes", async () => {
		const { agent, runner } = boundAgent();

		await agent.approve("s-1", ToolCallId.from("c-1"), "gabriel");

		expect(runner.decisions[0]?.by).toBe("gabriel");
	});

	describe("the prompt it builds per run", () => {
		it("declares none by default, which is a valid composition", async () => {
			const agent = new SupportAgent();

			expect(await agent.buildPrompt()).toBeUndefined();
		});

		it("refuses to render anything until the module handed it the prompting toolkit", () => {
			expect(() => new SupportAgent().reachPrompting()).toThrow(AgentNotBoundError);
		});

		it("renders through the toolkit the module handed it", () => {
			const agent = new SupportAgent();

			agent.bindTo(new AgentHandle(SUPPORT, Object.create(null)), new AgentPrompting(new EmptyPrompts()));

			expect(agent.reachPrompting().render("Hello {{name}}.", { name: "Ana" })).toBe("Hello Ana.");
		});
	});
});
