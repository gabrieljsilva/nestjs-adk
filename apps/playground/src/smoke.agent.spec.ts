import "@nestjs-adk/testing/matchers";
import { SessionStore } from "@nestjs-adk/core";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { ChatService } from "./support/chat.service";

// Loads the root .env (GEMINI_API_KEY) — without a key, the whole suite is skipped (CI doesn't break).
try {
	process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
} catch {
	// no .env — proceed with just the process environment
}

const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY);

describe.runIf(hasKey)("SMOKE — playground with REAL Gemini", () => {
	let app: TestingModule;
	let chat: ChatService;

	beforeAll(async () => {
		app = await Test.createTestingModule({ imports: [AppModule] }).compile();
		// @nestjs/testing silences the logger by default — re-enable so RunLogger output is visible.
		app.useLogger(console);
		await app.init();
		chat = app.get(ChatService);
	});

	afterAll(async () => {
		await app?.close();
	});

	it(
		"order lookup: the REAL model decides to call lookup_order and answers with the status",
		{ timeout: 60_000 },
		async () => {
			const run = await chat.send("smoke-1", "u1", "What's the status of my order 123? Use the lookup tool.");

			console.log("\n[REAL] usage:", JSON.stringify(run.usage));
			console.log(
				"[REAL] tools:",
				run.events.filter((e) => e.type === "tool_call").map((e) => ("tool" in e ? e.tool : "")),
			);
			console.log("[REAL] response:", run.text);

			expect(run.status).toBe("completed");
			expect(run).toHaveCalledTool("lookup_order", { orderId: "123" });
			expect(run.text.toLowerCase()).toMatch(/shipped|sent|on the way|delivered/);
			expect(run.usage.totalTokens).toBeGreaterThan(0);

			// REAL embeddings (GeminiEmbedder from the module) — meaning, not wording
			await expect(run).toBeSemanticallySimilarTo("Your order has been shipped and is on its way.", {
				threshold: 0.7,
			});
		},
	);

	it("multi-turn with session: the model uses the previous turn's history", { timeout: 60_000 }, async () => {
		await chat.send("smoke-2", "u1", "My name is Gabriel and my order is 456.");
		const run = await chat.send("smoke-2", "u1", "What's my name and which order did I mention?");

		console.log("\n[REAL] multi-turn response:", run.text);

		expect(run.text).toContain("Gabriel");
		expect(run.text).toContain("456");

		const session = await app.get(SessionStore).get("smoke-2");
		expect(session?.events.filter((e) => e.type === "message").length).toBeGreaterThanOrEqual(4);
	});

	it("REAL HITL: a large refund pauses awaiting approval and resumes with approve()", { timeout: 90_000 }, async () => {
		// The real model sometimes asks for confirmation in text before calling the tool —
		// retry within the same session until the run actually pauses (max 3 turns).
		let paused = await chat.send(
			"smoke-3",
			"u1",
			"I need a refund for order 456 for $1800. Please call the refund tool now — calling it is exactly how the manual approval request gets registered in our system.",
		);
		for (let attempt = 0; attempt < 2 && paused.status !== "pending_approval"; attempt++) {
			paused = await chat.send(
				"smoke-3",
				"u1",
				"Yes — calling the refund tool IS the approval request. Call it now for order 456, amount 1800.",
			);
		}

		console.log("\n[REAL] status:", paused.status, "| pending:", JSON.stringify(paused.pending));
		console.log("[REAL] paused response:", paused.text);

		expect(paused.status).toBe("pending_approval");
		expect(paused.pending?.[0]?.tool).toBe("refund");

		// biome-ignore lint/style/noNonNullAssertion: pending action guaranteed above
		const resumed = await chat.approve("smoke-3", paused.pending![0]!.callId);
		console.log("[REAL] post-approval response:", resumed.text);

		expect(resumed.status).toBe("completed");
		expect(resumed.text.length).toBeGreaterThan(0);
	});
});
