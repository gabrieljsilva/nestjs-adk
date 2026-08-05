import {
	AdkAgent,
	AdkModel,
	AdkModule,
	AdkTool,
	Agent,
	ArtifactStore,
	ContextCollector,
	type ModelPart,
	type ModelRequest,
	type ModelResponse,
	SessionStore,
	Tool,
	toolContent,
} from "@nestjs-adk/core";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { GoogleAdkEngine } from "./google-adk-engine";

/** 1x1 transparent PNG: small enough to assert on, real enough to be binary. */
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const CSV_TEXT = "product,revenue\nwidget,1200\ngadget,890";
const CSV_BASE64 = Buffer.from(CSV_TEXT, "utf8").toString("base64");
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSX_BASE64 = Buffer.from("PKbinary-zip-payload".repeat(40), "utf8").toString("base64");

const ATTACHMENTS: Record<string, { mimeType: string; base64: string }> = {
	photo: { mimeType: "image/png", base64: PNG_BASE64 },
	sales: { mimeType: "text/csv", base64: CSV_BASE64 },
	sheet: { mimeType: XLSX_MIME, base64: XLSX_BASE64 },
};

const attachmentSchema = z.object({ name: z.string() });

@Tool({
	name: "view_attachment",
	description: "Loads an attachment so it can be looked at.",
	schema: attachmentSchema,
})
class ViewAttachmentTool extends AdkTool<typeof attachmentSchema> {
	execute(input: z.infer<typeof attachmentSchema>) {
		const file = ATTACHMENTS[input.name];
		if (!file) return { error: `No attachment named "${input.name}".` };
		return toolContent([{ data: file }]);
	}
}

/** Calls view_attachment on the first turn, then answers, recording every request it was given. */
@Injectable()
class VisionModel extends AdkModel {
	public readonly model = "vision-test-model";
	public requests: ModelRequest[] = [];

	public async *generate(request: ModelRequest): AsyncIterable<ModelResponse> {
		this.requests.push(request);
		const answered = request.messages.some((message) => message.parts.some((part) => "toolResult" in part));
		if (!answered) {
			const asked = request.messages
				.flatMap((message) => message.parts)
				.flatMap((part) => ("text" in part ? [part.text] : []))
				.at(-1);
			yield { parts: [{ toolCall: { name: "view_attachment", args: { name: asked ?? "" } } }] };
			return;
		}
		yield { parts: [{ text: "Looked at it." }], usage: { promptTokens: 12, outputTokens: 3, totalTokens: 15 } };
	}
}

@Agent({ name: "viewer", description: "Looks at attachments.", model: VisionModel, tools: [ViewAttachmentTool] })
class ViewerAgent extends AdkAgent {}

@Injectable()
class ChatService {
	constructor(
		public readonly agent: ViewerAgent,
		public readonly model: VisionModel,
	) {}
}

@Module({ providers: [VisionModel, ViewAttachmentTool, ViewerAgent, ChatService] })
class FeatureModule {}

function partsOf(request: ModelRequest): ModelPart[] {
	return request.messages.flatMap((message) => message.parts);
}

function textOf(request: ModelRequest): string {
	return partsOf(request)
		.flatMap((part) => ("text" in part ? [part.text] : []))
		.join("\n");
}

describe("multimodal tool results", () => {
	let app: TestingModule;
	let chat: ChatService;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine }), FeatureModule],
		}).compile();
		await app.init();
		chat = app.get(ChatService);
	});

	afterEach(async () => {
		await app?.close();
	});

	it("delivers an image to the model as binary content, not as a serialized result", async () => {
		await chat.agent.ask({ message: "photo" });

		// the turn AFTER the tool ran is the one that must carry the bytes
		const followUp = chat.model.requests.at(-1);
		const binary = partsOf(followUp as ModelRequest).filter((part) => "data" in part);

		expect(binary).toContainEqual({ data: { mimeType: "image/png", base64: PNG_BASE64 } });
	});

	it("keeps the base64 out of the tool result: the model gets an acknowledgement, not the payload", async () => {
		await chat.agent.ask({ message: "photo" });

		const followUp = chat.model.requests.at(-1) as ModelRequest;
		const results = partsOf(followUp).flatMap((part) => ("toolResult" in part ? [part.toolResult] : []));

		expect(results).toHaveLength(1);
		expect(JSON.stringify(results[0])).not.toContain(PNG_BASE64);
	});

	it("decodes text-like attachments instead of shipping them as binary", async () => {
		await chat.agent.ask({ message: "sales" });

		const followUp = chat.model.requests.at(-1) as ModelRequest;

		// a CSV the model can just read: sending it as inline binary would waste the tokens twice over
		expect(textOf(followUp)).toContain(CSV_TEXT);
		expect(partsOf(followUp).filter((part) => "data" in part)).toEqual([]);
	});

	it("describes formats no model can read, instead of feeding them useless bytes", async () => {
		await chat.agent.ask({ message: "sheet" });

		const followUp = chat.model.requests.at(-1) as ModelRequest;
		const text = textOf(followUp);

		expect(partsOf(followUp).filter((part) => "data" in part)).toEqual([]);
		expect(text).toContain(XLSX_MIME);
		expect(text).toMatch(/KB/);
		expect(text).not.toContain(XLSX_BASE64);
	});

	it("never persists the payload in the session: attachments stay ephemeral", async () => {
		const run = await chat.agent.ask({ message: "photo", sessionId: "meeting-1" });

		const session = await app.get(SessionStore).get("meeting-1");

		expect(run.text).toBe("Looked at it.");
		expect(session).not.toBeNull();
		// twenty attachments in a one-hour meeting must not accumulate in the stored history
		expect(JSON.stringify(session?.events)).not.toContain(PNG_BASE64);
		expect(JSON.stringify(run.events)).not.toContain(PNG_BASE64);
	});

	it("keeps a large attachment out of the offload path", async () => {
		// well past DEFAULT_OFFLOAD_THRESHOLD: offloading would replace the image the model was asked to
		// look at with a 300-character preview of its own base64
		const huge = Buffer.alloc(30_000, 7).toString("base64");
		ATTACHMENTS.huge = { mimeType: "image/png", base64: huge };

		await chat.agent.ask({ message: "huge" });

		const followUp = chat.model.requests.at(-1) as ModelRequest;
		const results = partsOf(followUp).flatMap((part) => ("toolResult" in part ? [part.toolResult] : []));

		expect(partsOf(followUp)).toContainEqual({ data: { mimeType: "image/png", base64: huge } });
		expect(JSON.stringify(results)).not.toContain("__artifact");
	});
});

describe("attachments under diagnostics", () => {
	let app: TestingModule;
	let chat: ChatService;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, diagnostics: true }), FeatureModule],
		}).compile();
		await app.init();
		chat = app.get(ChatService);
	});

	afterEach(async () => {
		await app?.close();
	});

	it("summarizes binary payloads instead of retaining them in the snapshot", async () => {
		const run = await chat.agent.ask({ message: "photo" });

		const snapshots = ContextCollector.getActive()?.snapshotsOf(run) ?? [];
		const contents = snapshots.at(-1)?.segments.find((segment) => segment.kind === "contents")?.text ?? "";

		// a run holding every attachment's base64 in memory is a leak the diagnostics themselves caused
		expect(contents).toContain("image/png");
		expect(contents).not.toContain(PNG_BASE64);
	});

	it("stays deterministic, so the stable-prefix verdict still means something", async () => {
		const first = await chat.agent.ask({ message: "photo" });
		const second = await chat.agent.ask({ message: "photo" });

		const contentsOf = (run: Awaited<ReturnType<typeof chat.agent.ask>>) =>
			ContextCollector.getActive()
				?.snapshotsOf(run)
				?.at(-1)
				?.segments.find((segment) => segment.kind === "contents")?.text ?? "";

		expect(contentsOf(first)).toBe(contentsOf(second));
	});
});

/** Reads whatever artifact the user names, then answers. */
@Injectable()
class ArtifactModel extends AdkModel {
	public readonly model = "artifact-test-model";
	public requests: ModelRequest[] = [];

	public async *generate(request: ModelRequest): AsyncIterable<ModelResponse> {
		this.requests.push(request);
		const answered = request.messages.some((message) => message.parts.some((part) => "toolResult" in part));
		if (!answered) {
			const asked = request.messages
				.flatMap((message) => message.parts)
				.flatMap((part) => ("text" in part ? [part.text] : []))
				.at(-1);
			yield { parts: [{ toolCall: { name: "read_artifact", args: { name: asked ?? "" } } }] };
			return;
		}
		yield { parts: [{ text: "Read it." }], usage: { promptTokens: 8, outputTokens: 2, totalTokens: 10 } };
	}
}

@Agent({ name: "reader", description: "Reads artifacts.", model: ArtifactModel, tools: [ViewAttachmentTool] })
class ReaderAgent extends AdkAgent {}

@Injectable()
class ReaderService {
	constructor(
		public readonly agent: ReaderAgent,
		public readonly model: ArtifactModel,
	) {}
}

@Module({ providers: [ArtifactModel, ViewAttachmentTool, ReaderAgent, ReaderService] })
class ReaderModule {}

describe("read_artifact", () => {
	let app: TestingModule;
	let reader: ReaderService;
	let artifacts: ArtifactStore;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine }), ReaderModule],
		}).compile();
		await app.init();
		reader = app.get(ReaderService);
		artifacts = app.get(ArtifactStore);
	});

	afterEach(async () => {
		await app?.close();
	});

	it("hands a stored image back as something the model can look at", async () => {
		await artifacts.save(
			{ sessionId: "session-1", name: "photo.png" },
			{ mimeType: "image/png", data: PNG_BASE64, encoding: "base64" },
		);

		await reader.agent.ask({ message: "photo.png", sessionId: "session-1" });

		const followUp = reader.model.requests.at(-1) as ModelRequest;

		expect(partsOf(followUp)).toContainEqual({ data: { mimeType: "image/png", base64: PNG_BASE64 } });
	});

	it("still reads offloaded tool results as plain text", async () => {
		const payload = JSON.stringify({ orders: [{ id: 7, total: 91.5 }] });
		await artifacts.save(
			{ sessionId: "session-2", name: "tool-results/orders" },
			{
				mimeType: "application/json",
				data: payload,
			},
		);

		await reader.agent.ask({ message: "tool-results/orders", sessionId: "session-2" });

		const followUp = reader.model.requests.at(-1) as ModelRequest;

		// offload is the reason read_artifact exists: routing must not turn its JSON into binary
		expect(JSON.stringify(followUp)).toContain("91.5");
		expect(partsOf(followUp).filter((part) => "data" in part)).toEqual([]);
	});
});
