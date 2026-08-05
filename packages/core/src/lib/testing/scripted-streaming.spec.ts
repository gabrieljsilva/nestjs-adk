import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { Agent } from "../decorators/agent.decorator";
import { Tool } from "../decorators/tool.decorator";
import { AdkModule } from "../module/adk.module";
import type { AgentEvent } from "../types/events";
import { ScriptedEngine, callTool, deltas } from "./scripted-engine";

const CHUNKS = ["Your order ", "has shipped ", "and arrives Friday."];
const FULL_TEXT = CHUNKS.join("");

@Agent({ name: "streamer", model: "m", description: "Streams." })
class StreamerAgent extends AdkAgent {
	@Tool({ description: "Looks something up.", schema: z.object({ id: z.number() }) })
	lookup(input: { id: number }) {
		return { found: input.id };
	}
}

@Injectable()
class ChatService {
	constructor(public readonly agent: StreamerAgent) {}
}

@Module({ providers: [StreamerAgent, ChatService] })
class FeatureModule {}

async function collect(stream: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

describe("ScriptedEngine: streaming turns", () => {
	let app: TestingModule;
	let chat: ChatService;
	let engine: InstanceType<typeof ScriptedEngine>;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "m" }), FeatureModule],
		}).compile();
		await app.init();
		chat = app.get(ChatService);
		engine = app.get(AdkEngine) as InstanceType<typeof ScriptedEngine>;
	});

	afterEach(async () => {
		await app?.close();
	});

	it("emits one partial per chunk, so a streaming consumer has something to consume", async () => {
		engine.enqueue([deltas(CHUNKS)]);

		const events = await collect(chat.agent.stream.ask({ message: "where is my order?" }));
		const partials = events.filter((event) => event.type === "llm_response" && event.partial === true);

		expect(partials.map((event) => ("text" in event ? event.text : ""))).toEqual(CHUNKS);
	});

	it("follows the partials with the aggregated response, like a real provider does", async () => {
		engine.enqueue([deltas(CHUNKS)]);

		const events = await collect(chat.agent.stream.ask({ message: "where is my order?" }));
		const aggregated = events.filter((event) => event.type === "llm_response" && event.partial !== true);

		// the provider sends both; a test engine that sends only one of them tests fiction
		expect(aggregated).toHaveLength(1);
		const [response] = aggregated;
		expect(response && "text" in response && response.text).toBe(FULL_TEXT);
	});

	it("reports usage once, on the aggregated response: deltas are not billable events", async () => {
		engine.enqueue([deltas(CHUNKS, { promptTokens: 10, outputTokens: 6, totalTokens: 16 })]);

		const run = await chat.agent.ask({ message: "where is my order?" });

		expect(run.usage).toMatchObject({ promptTokens: 10, outputTokens: 6, totalTokens: 16 });
		expect(run.text).toBe(FULL_TEXT);
	});

	it("mixes with the other turns, so a tool call can precede a streamed answer", async () => {
		engine.enqueue([callTool("lookup", { id: 7 }), deltas(["Checking", "... done."])]);

		const events = await collect(chat.agent.stream.ask({ message: "hi" }));

		// the tool has to run before the deltas, and the final text must be the streamed answer only
		expect(events.filter((event) => event.type === "tool_result")).toHaveLength(1);
		expect(events.findIndex((event) => event.type === "tool_result")).toBeLessThan(
			events.findIndex((event) => event.type === "llm_response" && event.partial === true),
		);
		expect(events.find((event) => event.type === "final")?.text).toBe("Checking... done.");
	});
});
