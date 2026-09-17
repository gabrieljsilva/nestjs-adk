import { describe, expect, it } from "vitest";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { ToolCallObserver } from "../../../contracts/tool/tool-call-observer.contract";
import { ToolSource } from "../../../contracts/tool/tool-source.contract";
import { AgentName } from "../../../domain/agent/agent-name.value-object";
import { Actor } from "../../../domain/tool/access/actor.value-object";
import type { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import type { RuntimeServices } from "../../../runtime/composition/runtime-services.value-object";
import { AgentHandle } from "./agent-handle.edge";

const SUPPORT = AgentName.from("support");
const SESSION = SessionId.from("s-1");

class SilentSource extends ToolSource {
	public readonly name = "silent";

	public async open(): Promise<readonly ToolDefinition[]> {
		return [];
	}

	public async close(): Promise<void> {
		return undefined;
	}
}

class SilentObserver extends ToolCallObserver {
	public requested(): void {}

	public settled(): void {}
}

/** Records what the handle asked the runtime for, which is all the handle decides. */
function spyingRuntime() {
	const calls: Array<{ verb: string; payload: unknown }> = [];
	const runtime = {
		runner: {
			ask: async (command: unknown) => {
				calls.push({ verb: "ask", payload: command });
				return "asked";
			},
			approve: async (input: unknown) => {
				calls.push({ verb: "approve", payload: input });
				return "approved";
			},
			reject: async (input: unknown) => {
				calls.push({ verb: "reject", payload: input });
				return "rejected";
			},
			delegate: async (input: unknown) => {
				calls.push({ verb: "delegate", payload: input });
				return "delegated";
			},
		},
		sessions: {
			inspect: async (sessionId: unknown) => {
				calls.push({ verb: "inspect", payload: sessionId });
				return "inspected";
			},
			create: async (agent: unknown, input: unknown) => {
				calls.push({ verb: "create", payload: { agent, input } });
				return "created";
			},
			find: async (sessionId: unknown) => {
				calls.push({ verb: "find", payload: sessionId });
				return "found";
			},
			findOrFail: async (sessionId: unknown) => {
				calls.push({ verb: "findOrFail", payload: sessionId });
				return "found";
			},
		},
	};
	return { calls, handle: new AgentHandle(SUPPORT, Object(runtime)) };
}

describe("AgentHandle", () => {
	it("asks with the agent already filled in", async () => {
		const { calls, handle } = spyingRuntime();

		await handle.ask("hi");

		expect(Reflect.get(Object(calls[0]?.payload), "agent")).toBe(SUPPORT);
	});

	it("carries the session id when a conversation continues", async () => {
		const { calls, handle } = spyingRuntime();

		await handle.ask("again", SESSION);

		const input = Reflect.get(Object(calls[0]?.payload), "input");
		expect(Reflect.get(Object(input), "sessionId")).toBe(SESSION);
	});

	/**
	 * The id an application holds is text, read off a chat row, and every other verb here
	 * takes it that way. Accepting only the parsed form made this question open a second
	 * conversation instead of continuing the one it named, without failing.
	 */
	it("continues the conversation a session id names as plain text", async () => {
		const { calls, handle } = spyingRuntime();

		await handle.ask("again", "chat-42");

		const input = Reflect.get(Object(calls[0]?.payload), "input");
		expect(Reflect.get(Object(Reflect.get(Object(input), "sessionId")), "value")).toBe("chat-42");
	});

	it("answers about a session without running anything", async () => {
		const { calls, handle } = spyingRuntime();

		await handle.inspect(SESSION);

		expect(calls[0]).toEqual({ verb: "inspect", payload: SESSION });
	});

	it("opens a conversation under the agent it is a handle on", async () => {
		const { calls, handle } = spyingRuntime();

		await handle.createSession({ sessionId: "chat-42", metadata: { memberId: "gabriel" } });

		const payload = Object(calls[0]?.payload);
		expect(Reflect.get(payload, "agent")).toBe(SUPPORT);
		const input = Object(Reflect.get(payload, "input"));
		expect(Reflect.get(Object(Reflect.get(input, "sessionId")), "value")).toBe("chat-42");
		expect(Reflect.get(Object(Reflect.get(input, "metadata")), "size")).toBe(1);
	});

	it("opens a conversation the runtime names, when the caller named none", async () => {
		const { calls, handle } = spyingRuntime();

		await handle.createSession();

		const input = Object(Reflect.get(Object(calls[0]?.payload), "input"));
		expect(Reflect.get(input, "sessionId")).toBeUndefined();
	});

	it("parses a session id given as text before looking a conversation up", async () => {
		const { calls, handle } = spyingRuntime();

		await handle.findSessionById("chat-42");
		await handle.findSessionByIdOrFail("chat-42");

		expect(calls.map((call) => call.verb)).toEqual(["find", "findOrFail"]);
		expect(Reflect.get(Object(calls[0]?.payload), "value")).toBe("chat-42");
	});

	it("passes a decision through as the runtime's own input", async () => {
		const { calls, handle } = spyingRuntime();

		await handle.approve(SESSION, ToolCallId.from("c-1"), "a-human");
		await handle.reject(SESSION, ToolCallId.from("c-2"), "no", "a-human");

		expect(calls.map((call) => call.verb)).toEqual(["approve", "reject"]);
		expect(Reflect.get(Object(calls[1]?.payload), "reason")).toBe("no");
	});

	/** A source declared on the call belongs to the run, so the command is what carries it. */
	it("carries the sources a question declared into the command", async () => {
		const { calls, handle } = spyingRuntime();
		const source = new SilentSource();

		await handle.ask("hi", { sources: [source] });

		expect(Reflect.get(Object(calls[0]?.payload), "sources")).toEqual([source]);
	});

	it("carries no sources when a question declares none", async () => {
		const { calls, handle } = spyingRuntime();

		await handle.ask("hi", SESSION);

		expect(Reflect.get(Object(calls[0]?.payload), "sources")).toEqual([]);
	});

	it("carries the sources a decision declared, since the suspended run closed its own", async () => {
		const { calls, handle } = spyingRuntime();
		const source = new SilentSource();

		await handle.approve(SESSION, ToolCallId.from("c-1"), { by: "a-human", sources: [source] });

		expect(Reflect.get(Object(calls[0]?.payload), "sources")).toEqual([source]);
		expect(Reflect.get(Object(calls[0]?.payload), "approvedBy")).toBe("a-human");
	});

	it("delegates from itself, so the edges checked are its own", async () => {
		const { calls, handle } = spyingRuntime();

		await handle.delegate(SESSION, AgentName.from("researcher"), "find it");

		expect(Reflect.get(Object(calls[0]?.payload), "from")).toBe(SUPPORT);
		expect(Reflect.get(Object(calls[0]?.payload), "task")).toBe("find it");
	});

	/**
	 * The stop button of whoever is asking. It reaches the run the same way a delegation
	 * reaches its child, and it is the only way to end a run before the provider is done:
	 * abandoning the stream stops the reading, never the generating.
	 */
	it("carries the signal a question was asked with into the command", async () => {
		const { calls, handle } = spyingRuntime();
		const controller = new AbortController();

		await handle.ask("hi", { signal: controller.signal });

		expect(Reflect.get(Object(calls[0]?.payload), "signal")).toBe(controller.signal);
	});

	it("carries no signal when a question passes none", async () => {
		const { calls, handle } = spyingRuntime();

		await handle.ask("hi", SESSION);

		expect(Reflect.get(Object(calls[0]?.payload), "signal")).toBeUndefined();
	});

	it("watches a stream under the signal the caller passed", async () => {
		const { calls, handle } = spyingRuntime();
		const controller = new AbortController();

		await handle.ask("hi", { signal: controller.signal, sessionId: SESSION });

		expect(Reflect.get(Object(calls[0]?.payload), "signal")).toBe(controller.signal);
	});

	/** An approval runs a turn of its own, so the button has to work on that turn too. */
	it("carries the signal a decision was made with", async () => {
		const { calls, handle } = spyingRuntime();
		const controller = new AbortController();

		await handle.approve(SESSION, ToolCallId.from("c-1"), { by: "a-human", signal: controller.signal });
		await handle.reject(SESSION, ToolCallId.from("c-2"), "no", { signal: controller.signal });

		expect(Reflect.get(Object(calls[0]?.payload), "signal")).toBe(controller.signal);
		expect(Reflect.get(Object(calls[1]?.payload), "signal")).toBe(controller.signal);
	});

	it("carries who is asking into the command", async () => {
		const { calls, handle } = spyingRuntime();
		const actor = Actor.of("u-1");

		await handle.ask("hi", { actor });

		expect(Reflect.get(Object(calls[0]?.payload), "actor")).toBe(actor);
	});

	it("carries the observer of a question into the command", async () => {
		const { calls, handle } = spyingRuntime();
		const toolCalls = new SilentObserver();

		await handle.ask("hi", { toolCalls });

		expect(Reflect.get(Object(calls[0]?.payload), "toolCalls")).toBe(toolCalls);
	});

	it("carries the observer of a decision into it", async () => {
		const { calls, handle } = spyingRuntime();
		const toolCalls = new SilentObserver();

		await handle.approve(SESSION, ToolCallId.from("c-1"), { toolCalls });
		await handle.reject(SESSION, ToolCallId.from("c-2"), "no", { toolCalls });

		expect(Reflect.get(Object(calls[0]?.payload), "toolCalls")).toBe(toolCalls);
		expect(Reflect.get(Object(calls[1]?.payload), "toolCalls")).toBe(toolCalls);
	});

	it("carries who is deciding into the decision", async () => {
		const { calls, handle } = spyingRuntime();
		const actor = Actor.of("u-1");

		await handle.approve(SESSION, ToolCallId.from("c-1"), { by: "ana", actor });
		await handle.reject(SESSION, ToolCallId.from("c-2"), "no", { by: "ana", actor });

		expect(Reflect.get(Object(calls[0]?.payload), "actor")).toBe(actor);
		expect(Reflect.get(Object(calls[1]?.payload), "actor")).toBe(actor);
	});
});
