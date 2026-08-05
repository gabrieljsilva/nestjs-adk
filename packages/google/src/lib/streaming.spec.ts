import {
	AdkAgent,
	AdkModel,
	AdkModule,
	Agent,
	type AgentEvent,
	type GenerateOptions,
	type ModelRequest,
	type ModelResponse,
} from "@nestjs-adk/core";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { GoogleAdkEngine } from "./google-adk-engine";

const CHUNKS = ["Your order ", "has shipped ", "and arrives Friday."];
const FULL_TEXT = CHUNKS.join("");

/** Emits one chunk per call when asked to stream, and a single chunk when not. */
@Injectable()
class ChunkedModel extends AdkModel {
	public readonly model = "chunked-test-model";
	public lastStream?: boolean;

	public async *generate(_request: ModelRequest, options?: GenerateOptions): AsyncIterable<ModelResponse> {
		this.lastStream = options?.stream;
		if (!options?.stream) {
			yield { parts: [{ text: FULL_TEXT }], usage: { promptTokens: 10, outputTokens: 6, totalTokens: 16 } };
			return;
		}
		for (const chunk of CHUNKS) yield { parts: [{ text: chunk }] };
		yield { usage: { promptTokens: 10, outputTokens: 6, totalTokens: 16 }, finishReason: "STOP" };
	}
}

@Agent({ name: "streamer", model: ChunkedModel, description: "Streams.", prompt: "Answer." })
class StreamerAgent extends AdkAgent {}

@Injectable()
class ChatService {
	constructor(
		public readonly agent: StreamerAgent,
		public readonly model: ChunkedModel,
	) {}
}

@Module({ providers: [ChunkedModel, StreamerAgent, ChatService] })
class FeatureModule {}

function textDeltas(events: AgentEvent[]): string[] {
	return events
		.filter((event) => event.type === "llm_response" && event.partial === true)
		.map((event) => ("text" in event ? (event.text ?? "") : ""));
}

async function collect(stream: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

describe("token streaming", () => {
	let app: TestingModule;
	let chat: ChatService;

	async function boot(streaming?: boolean) {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, streaming }), FeatureModule],
		}).compile();
		await app.init();
		chat = app.get(ChatService);
	}

	afterEach(async () => {
		await app?.close();
	});

	it("streams deltas as partial llm_response events when streaming is on", async () => {
		await boot(true);

		const events = await collect(chat.agent.stream.ask({ message: "where is my order?" }));

		// the model must have been ASKED to stream: this is what runConfig controls
		expect(chat.model.lastStream).toBe(true);
		expect(textDeltas(events)).toEqual(CHUNKS);
	});

	it("marks the aggregated response so consumers do not concatenate it with the deltas", async () => {
		await boot(true);

		const events = await collect(chat.agent.stream.ask({ message: "where is my order?" }));
		const responses = events.filter((event) => event.type === "llm_response");
		const aggregated = responses.filter((event) => event.partial !== true);

		// concatenating every llm_response would duplicate the answer; only the deltas are deltas
		expect(textDeltas(events).join("")).toBe(FULL_TEXT);
		expect(aggregated.map((event) => ("text" in event ? event.text : undefined))).toEqual([FULL_TEXT]);
	});

	it("keeps the final text intact: deltas never corrupt the aggregation", async () => {
		await boot(true);

		const run = await chat.agent.ask({ message: "where is my order?" });

		expect(run.text).toBe(FULL_TEXT);
	});

	it("counts usage once, even though deltas arrive as separate events", async () => {
		await boot(true);

		const run = await chat.agent.ask({ message: "where is my order?" });

		expect(run.usage.outputTokens).toBe(6);
		expect(run.usage.totalTokens).toBe(16);
	});

	it("stays non-streaming by default: no partial events, one shot answer", async () => {
		await boot();

		const events = await collect(chat.agent.stream.ask({ message: "where is my order?" }));

		expect(chat.model.lastStream).toBe(false);
		expect(textDeltas(events)).toEqual([]);
		expect(events.find((event) => event.type === "final")?.text).toBe(FULL_TEXT);
	});

	it("per-run streaming overrides the module default", async () => {
		await boot(false);

		await collect(chat.agent.stream.ask({ message: "hi", streaming: true }));

		expect(chat.model.lastStream).toBe(true);
	});
});
