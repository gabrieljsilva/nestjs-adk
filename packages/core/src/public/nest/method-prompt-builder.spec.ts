import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { AgentName } from "../../domain/agent/agent-name";
import { PromptContext } from "../../domain/prompt/prompt-context";
import { SessionOwner } from "../../domain/session/session-owner";
import { AdkAgent } from "./adk-agent";
import { MethodPromptBuilder } from "./method-prompt-builder";

const CONTEXT = new PromptContext(
	SessionId.from("s-1"),
	AgentRunId.from("r-1"),
	AgentName.from("support"),
	SessionOwner.from("user-7"),
);

class SilentAgent extends AdkAgent {}

class GreetingAgent extends AdkAgent {
	public calls = 0;

	protected override async prompt(context: PromptContext): Promise<string> {
		this.calls += 1;
		return `You are ${context.agent.value}, answering ${context.owner?.value ?? "nobody"}.`;
	}
}

/** Two levels down, to prove the check is not "did this exact class declare it". */
class PoliteGreetingAgent extends GreetingAgent {}

class BlankAgent extends AdkAgent {
	protected override async prompt(): Promise<string> {
		return "   \n  ";
	}
}

class UndecidedAgent extends AdkAgent {
	protected override async prompt(): Promise<string | undefined> {
		return undefined;
	}
}

class FailingAgent extends AdkAgent {
	protected override async prompt(): Promise<string> {
		throw new Error("the customer repository is down");
	}
}

/** An agent reaching what NestJS injected is the whole reason the method is called on the instance. */
class InjectedAgent extends AdkAgent {
	public constructor(private readonly store: string) {
		super();
	}

	protected override async prompt(): Promise<string> {
		return `You work at ${this.store}.`;
	}
}

describe("MethodPromptBuilder", () => {
	describe("which instances get one", () => {
		it("builds nothing for an agent that did not override prompt()", () => {
			expect(MethodPromptBuilder.forInstance(new SilentAgent())).toBeUndefined();
		});

		it("builds one for an agent that did", () => {
			expect(MethodPromptBuilder.forInstance(new GreetingAgent())).toBeInstanceOf(MethodPromptBuilder);
		});

		it("builds one for a subclass of an agent that did", () => {
			expect(MethodPromptBuilder.forInstance(new PoliteGreetingAgent())).toBeInstanceOf(MethodPromptBuilder);
		});

		it("builds nothing for something that is not an agent at all", () => {
			expect(MethodPromptBuilder.forInstance({ prompt: () => "text" })).toBeUndefined();
			expect(MethodPromptBuilder.forInstance(undefined)).toBeUndefined();
		});
	});

	it("hands the context to the method and answers what it returned", async () => {
		const builder = MethodPromptBuilder.forInstance(new GreetingAgent());

		const instructions = await builder?.build(CONTEXT);

		expect(instructions?.text).toBe("You are support, answering user-7.");
	});

	it("calls the method on the instance, so what was injected is still reachable", async () => {
		const builder = MethodPromptBuilder.forInstance(new InjectedAgent("Nébula Games"));

		expect((await builder?.build(CONTEXT))?.text).toBe("You work at Nébula Games.");
	});

	/** No instruction is a valid composition, so an agent that decided on none gets none. */
	it("answers nothing for a prompt that came back undefined", async () => {
		const builder = MethodPromptBuilder.forInstance(new UndecidedAgent());

		expect(await builder?.build(CONTEXT)).toBeUndefined();
	});

	it("answers nothing for a prompt that came back blank, rather than an empty instruction", async () => {
		const builder = MethodPromptBuilder.forInstance(new BlankAgent());

		expect(await builder?.build(CONTEXT)).toBeUndefined();
	});

	/** Whatever the agent threw is what the run fails with: nothing here turns it into an absence. */
	it("lets a failure inside the method travel out", async () => {
		const builder = MethodPromptBuilder.forInstance(new FailingAgent());

		await expect(builder?.build(CONTEXT)).rejects.toThrow("the customer repository is down");
	});
});
