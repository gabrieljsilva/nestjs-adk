import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { ToolSource } from "../../contracts/tool-source";
import { AgentName } from "../../domain/agent/agent-name";
import type { ToolDefinition } from "../../domain/tool/tool-definition";
import type { RuntimeServices } from "../../runtime/composition/runtime-services";
import { AgentHandle } from "./agent-handle";

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
			handle: async (sessionId: unknown) => {
				calls.push({ verb: "inspect", payload: sessionId });
				return "inspected";
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

	it("answers about a session without running anything", async () => {
		const { calls, handle } = spyingRuntime();

		await handle.inspect(SESSION);

		expect(calls[0]).toEqual({ verb: "inspect", payload: SESSION });
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
});
