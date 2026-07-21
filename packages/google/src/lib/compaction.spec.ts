import {
	AdkAgent,
	AdkEngine,
	AdkModule,
	Agent,
	AgentRegistry,
	AgentSessions,
	ScriptedModel,
	contextPolicy,
	text,
} from "@nestjs-adk/core";
import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { GoogleAdkEngine } from "./google-adk-engine";

const mainModel = new ScriptedModel();
const summarizer = new ScriptedModel();

@Agent({
	name: "long_chat",
	model: mainModel,
	description: "Long chat.",
	context: contextPolicy({
		compaction: { maxTokens: 50, keepRecent: 2, summarizer },
	}),
})
class LongChatAgent extends AdkAgent {}

@Module({ providers: [LongChatAgent] })
class FeatureModule {}

describe("GoogleAdkEngine — native compaction (F7)", () => {
	let app: TestingModule;

	beforeEach(async () => {
		mainModel.scripts.length = 0;
		summarizer.scripts.length = 0;
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, defaultModel: "gemini-2.5-flash" }), FeatureModule],
		}).compile();
		await app.init();
	});

	afterEach(async () => {
		await app.close();
	});

	it("long history triggers the TokenBasedContextCompactor: prompt receives the SUMMARY instead of the old turns", async () => {
		const sessions = app.get(AgentSessions);
		await sessions.create({ id: "long-1", userId: "u1" });
		for (let i = 0; i < 12; i++) {
			await sessions.append("long-1", {
				type: "message",
				author: i % 2 === 0 ? "user" : "agent",
				data: { text: `historical message number ${i} with plenty of repeated content to bust the token limit` },
			});
		}

		summarizer.enqueue([text("SUMMARY-OF-OLD-CONVERSATION")]);
		mainModel.enqueue([text("continuing the conversation")]);

		const run = await app.get(AgentRegistry).getRef(LongChatAgent).ask({ sessionId: "long-1", message: "hey?" });
		expect(run.text).toBe("continuing the conversation");

		const engine = app.get(AdkEngine) as GoogleAdkEngine;
		const contents = JSON.stringify(engine.lastRequest?.contents ?? []);
		expect(contents).toContain("SUMMARY-OF-OLD-CONVERSATION");
		// old turns elided from the prompt (tail preserved)
		expect(contents).not.toContain("historical message number 0");
	});
});
