import { type AgentHandle, AgentRegistry, type AgentResult, SessionId, ToolCallId } from "@nestjs-adk/core";
import type { ScriptedModel } from "./scripted-model";

/** Anything with a DI `get`: a TestingModule, an application, a ModuleRef. */
interface DiContainer {
	get<T>(token: (abstract new (...args: never[]) => T) | string | symbol): T;
}

/**
 * A test's handle on one agent, over the real container and the real run path.
 *
 * Scripting happens on the model rather than on this: a run started by a production
 * service consumes the same script as one started here, which is what makes an assertion
 * about the application and not about the test's own shortcut.
 *
 * It holds the session it started, so a follow up and a decision go to the conversation
 * that is actually waiting rather than to a new one.
 */
export class TestAgent {
	private current?: SessionId;

	public constructor(
		container: DiContainer,
		private readonly name: string,
		public readonly model: ScriptedModel,
	) {
		this.agents = container.get(AgentRegistry);
	}

	private readonly agents: AgentRegistry;

	public get handle(): AgentHandle {
		return this.agents.get(this.name);
	}

	/** The session this handle has been talking in, once it has said anything. */
	public get sessionId(): SessionId | undefined {
		return this.current;
	}

	public mockText(text: string): this {
		this.model.mockText(text);
		return this;
	}

	public mockToolCall(tool: string, args: Record<string, unknown> = {}): this {
		this.model.mockToolCall(tool, args);
		return this;
	}

	public async ask(message: string): Promise<AgentResult> {
		const result = await this.handle.ask(message, this.current);
		this.current = result.sessionId;
		return result;
	}

	public async approve(callId: string, approvedBy = "test"): Promise<AgentResult> {
		return this.handle.approve(this.sessionOrFail(), ToolCallId.from(callId), approvedBy);
	}

	public async reject(callId: string, reason = "refused by the test"): Promise<AgentResult> {
		return this.handle.reject(this.sessionOrFail(), ToolCallId.from(callId), reason);
	}

	/** Where the conversation stands, which is how a test finds what to approve. */
	public async inspect() {
		return this.handle.inspect(this.sessionOrFail());
	}

	/** The instruction the last turn was sent with, which is where an always skill lands. */
	public lastInstruction(): string {
		return this.model.requests.at(-1)?.instructions?.text ?? "";
	}

	private sessionOrFail(): SessionId {
		if (this.current === undefined) throw new Error("this agent has not been asked anything yet");
		return this.current;
	}
}
