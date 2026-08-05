import {
	AdkAgent,
	AdkEngine,
	AdkModule,
	Agent,
	type AgentEvent,
	ScriptedEngine,
	SessionStore,
	Tool,
	callTool,
	deltas,
	text,
} from "@nestjs-adk/core";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";

const lookupSchema = z.object({ id: z.number() });
const chargeSchema = z.object({ amount: z.number() });

@Agent({
	name: "public_runtime_characterization",
	description: "Characterizes the public runtime contract",
	model: "characterization",
})
class PublicRuntimeCharacterizationAgent extends AdkAgent {
	public readonly lookedUpIds: number[] = [];
	public readonly chargedAmounts: number[] = [];

	@Tool({
		name: "lookup",
		description: "Looks up a record by id",
		schema: lookupSchema,
		effect: "read",
	})
	public lookup(input: z.infer<typeof lookupSchema>): { foundId: number } {
		this.lookedUpIds.push(input.id);
		return { foundId: input.id };
	}

	@Tool({
		name: "charge",
		description: "Charges an amount",
		schema: chargeSchema,
		effect: "destructive",
	})
	public charge(input: z.infer<typeof chargeSchema>): { chargedAmount: number } {
		this.chargedAmounts.push(input.amount);
		return { chargedAmount: input.amount };
	}
}

describe("public runtime characterization", () => {
	let moduleRef: TestingModule;
	let agent: PublicRuntimeCharacterizationAgent;
	let engine: ScriptedEngine;
	let sessions: SessionStore;

	beforeEach(async () => {
		moduleRef = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot({
					engine: ScriptedEngine,
					defaultModel: "characterization",
				}),
			],
			providers: [PublicRuntimeCharacterizationAgent],
		}).compile();
		await moduleRef.init();

		agent = moduleRef.get(PublicRuntimeCharacterizationAgent);
		sessions = moduleRef.get(SessionStore);

		const resolvedEngine = moduleRef.get(AdkEngine);
		if (!(resolvedEngine instanceof ScriptedEngine)) {
			throw new Error("Expected the public ScriptedEngine adapter");
		}
		engine = resolvedEngine;
	});

	afterEach(async () => {
		await moduleRef.close();
	});

	it("executes ask through a Nest-injected agent", async () => {
		engine.enqueue([text("hello from the agent")]);

		const result = await agent.ask({ message: "hello" });

		expect(result.status).toBe("completed");
		expect(result.text).toBe("hello from the agent");
	});

	it("continues the same durable session across asks", async () => {
		const sessionId = "characterization-session";
		engine.enqueue([text("first answer")]);
		await agent.ask({ sessionId, message: "first question" });

		engine.enqueue([text("second answer")]);
		await agent.ask({ sessionId, message: "second question" });

		const session = await sessions.get(sessionId);
		if (!session) {
			throw new Error("Expected the session to be persisted");
		}

		const messageEvents = session.events.filter((event) => event.type === "message");
		expect(messageEvents).toHaveLength(4);
		expect(messageEvents.map((event) => event.author)).toEqual(["user", "agent", "user", "agent"]);
	});

	it("correlates a tool call with its result without network access", async () => {
		engine.enqueue([callTool("lookup", { id: 7 }), text("record found")]);

		const result = await agent.ask({ message: "find record 7" });
		const toolCall = result.events.find((event) => event.type === "tool_call");
		const toolResult = result.events.find((event) => event.type === "tool_result");
		if (!toolCall || toolCall.type !== "tool_call") {
			throw new Error("Expected a tool call event");
		}
		if (!toolResult || toolResult.type !== "tool_result") {
			throw new Error("Expected a tool result event");
		}

		expect(agent.lookedUpIds).toEqual([7]);
		expect(toolResult.callId).toBe(toolCall.callId);
		expect(result.text).toBe("record found");
	});

	it("suspends a destructive tool and resumes it after approval", async () => {
		const sessionId = "approval-session";
		engine.enqueue([callTool("charge", { amount: 25 })]);

		const paused = await agent.ask({ sessionId, message: "charge 25" });
		expect(paused.status).toBe("pending_approval");
		expect(agent.chargedAmounts).toEqual([]);

		const pending = paused.pending?.[0];
		if (!pending) {
			throw new Error("Expected a pending approval");
		}

		engine.enqueue([text("charge approved")]);
		const resumed = await agent.approve({
			sessionId,
			callId: pending.callId,
		});

		expect(resumed.status).toBe("completed");
		expect(resumed.text).toBe("charge approved");
		expect(agent.chargedAmounts).toEqual([25]);
	});

	it("emits ordered chunks followed by one terminal result", async () => {
		engine.enqueue([deltas(["one", " two", " three"])]);
		const events: AgentEvent[] = [];

		for await (const event of agent.stream.ask({ message: "count" })) {
			events.push(event);
		}

		const chunks = events
			.filter((event) => event.type === "llm_response" && event.partial === true)
			.map((event) => (event.type === "llm_response" ? event.text : ""));
		const terminalEvents = events.filter((event) => event.type === "final");

		expect(chunks).toEqual(["one", " two", " three"]);
		expect(terminalEvents).toHaveLength(1);
		expect(terminalEvents[0]).toMatchObject({
			type: "final",
			text: "one two three",
		});
		expect(events.at(-1)?.type).toBe("final");
	});
});
