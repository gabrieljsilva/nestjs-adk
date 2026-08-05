import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AgentName } from "../../domain/agent/agent-name";
import { MediaPart } from "../../domain/model/media-part";
import { AgentResult } from "../../domain/session/agent-result";
import { AgentRunStatus } from "../../domain/session/agent-run-status";
import type { RuntimeServices } from "../../runtime/composition/runtime-services";
import type { AgentRunCommand } from "../../runtime/run/agent-run-command";
import { AdkAgent } from "./adk-agent";
import { AgentHandle } from "./agent-handle";
import { AgentNotBoundError } from "./errors/agent-not-bound.error";

const SUPPORT = AgentName.from("support");
const PIXEL = "iVBORw0KGgo=";

class SupportAgent extends AdkAgent {}

/** Keeps the command instead of running it, which is what these cases are about. */
class RecordingRunner {
	public readonly commands: AgentRunCommand[] = [];

	public async ask(command: AgentRunCommand): Promise<AgentResult> {
		this.commands.push(command);
		return new AgentResult(SessionId.from("s-1"), AgentRunId.from(command.agent.value), AgentRunStatus.COMPLETED, "ok");
	}

	public async approve(): Promise<AgentResult> {
		return new AgentResult(SessionId.from("s-1"), AgentRunId.from("r-1"), AgentRunStatus.COMPLETED, "approved");
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
});
