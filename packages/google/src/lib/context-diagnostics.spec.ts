import {
	AdkAgent,
	AdkModule,
	AdkTool,
	Agent,
	AgentRunner,
	ContextCollector,
	ScriptedModel,
	SessionStore,
	Skill,
	Tool,
	comparePrefix,
	text,
} from "@nestjs-adk/core";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import "@nestjs-adk/testing/matchers";
import { GoogleAdkEngine } from "./google-adk-engine";

const orderSchema = z.object({ id: z.string() });
const stableModel = new ScriptedModel();
const volatileModel = new ScriptedModel();
const bareModel = new ScriptedModel();

@Tool({ name: "get_order", description: "Looks up an order.", schema: orderSchema })
class GetOrderTool extends AdkTool<typeof orderSchema> {
	execute(input: z.infer<typeof orderSchema>) {
		return { id: input.id, status: "shipped" };
	}
}

@Agent({
	name: "stable_support",
	model: stableModel,
	description: "Support agent.",
	prompt: "You are a support agent. Be brief and polite.",
	tools: [GetOrderTool],
})
class StableAgent extends AdkAgent {
	@Skill({ name: "tone", description: "Tone of voice.", mode: "always" })
	tone() {
		return "Always greet the customer by name.";
	}
}

/**
 * The classic cache killer: a value that changes every run, sitting at the top of the context.
 * A counter instead of a clock — same effect on the prefix, without depending on wall time.
 */
let renderCount = 0;

@Agent({
	name: "volatile_support",
	model: volatileModel,
	description: "Support agent with a volatile prompt.",
	tools: [GetOrderTool],
})
class VolatileAgent extends AdkAgent {
	@Skill({ name: "now", description: "Current time.", mode: "always" })
	now() {
		return `Current timestamp: 2026-07-26T10:00:0${renderCount++}Z`;
	}
}

@Agent({ name: "bare_support", model: bareModel, description: "No tools, no skills.", prompt: "Answer." })
class BareAgent extends AdkAgent {}

@Injectable()
class SupportService {
	constructor(
		public readonly stable: StableAgent,
		public readonly volatileAgent: VolatileAgent,
		public readonly bare: BareAgent,
	) {}
}

@Module({ providers: [GetOrderTool, StableAgent, VolatileAgent, BareAgent, SupportService] })
class FeatureModule {}

describe("Stable Prefix — context diagnostics over the ADK's real pipeline", () => {
	let app: TestingModule;
	let support: SupportService;

	beforeEach(async () => {
		for (const model of [stableModel, volatileModel, bareModel]) model.scripts.length = 0;
		app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot({ engine: GoogleAdkEngine, defaultModel: "gemini-2.5-flash", diagnostics: true }),
				FeatureModule,
			],
		}).compile();
		await app.init();
		support = app.get(SupportService);
	});

	afterEach(async () => {
		await app.close();
	});

	it("a well-built agent keeps a high prefix across different questions", async () => {
		stableModel.enqueue([text("Sure.")]).enqueue([text("Of course.")]);

		const runA = await support.stable.ask({ message: "where is my order?" });
		const runB = await support.stable.ask({ message: "I want to cancel my account, please help" });

		expect([runA, runB]).toHaveStablePrefix(0.85);

		// the threshold alone could pass by luck — what proves it is WHERE the contexts part ways
		const collector = ContextCollector.getActive();
		const snapshots = [runA, runB].map((run) => collector?.snapshotsOf(run)?.[0]);
		const report = comparePrefix(snapshots.filter((snapshot) => snapshot !== undefined));
		expect(report.divergesAt?.segment).toBe("contents");
	});

	it("a volatile value in the prompt drops the prefix and is located", async () => {
		volatileModel.enqueue([text("Sure.")]).enqueue([text("Of course.")]);

		// same question both times, so anything that differs came from the prompt itself
		const runA = await support.volatileAgent.ask({ message: "where is my order?" });
		const runB = await support.volatileAgent.ask({ message: "where is my order?" });

		const collector = ContextCollector.getActive();
		const snapshots = [runA, runB].map((run) => collector?.snapshotsOf(run)?.[0]);
		const report = comparePrefix(snapshots.filter((snapshot) => snapshot !== undefined));

		expect(report.divergesAt?.segment).toBe("systemInstruction");
		expect(report.divergesAt?.excerpts[0]).not.toBe(report.divergesAt?.excerpts[1]);
		expect(report.ratio).toBeLessThan(1);
	});

	it("the user message is the only volatile part of a stable agent", async () => {
		stableModel.enqueue([text("A.")]).enqueue([text("B.")]);

		const runA = await support.stable.ask({ message: "hi" });
		const runB = await support.stable.ask({ message: "a considerably longer question from the customer" });

		const collector = ContextCollector.getActive();
		const [a, b] = [runA, runB].map((run) => collector?.snapshotsOf(run)?.[0]);
		const instructionOf = (snapshot: typeof a) =>
			snapshot?.segments.find((segment) => segment.kind === "systemInstruction")?.text;
		const toolsOf = (snapshot: typeof a) =>
			snapshot?.segments.find((segment) => segment.kind === "toolDeclarations")?.text;

		expect(instructionOf(a)).toBe(instructionOf(b));
		expect(toolsOf(a)).toBe(toolsOf(b));
	});

	it("captures the instruction, the tool catalog and the conversation", async () => {
		stableModel.enqueue([text("Sure.")]);

		const run = await support.stable.ask({ message: "where is my order?" });
		const snapshot = ContextCollector.getActive()?.snapshotsOf(run)?.[0];
		const segment = (kind: string) => snapshot?.segments.find((entry) => entry.kind === kind)?.text ?? "";

		expect(segment("systemInstruction")).toContain("You are a support agent.");
		expect(segment("systemInstruction")).toContain("Always greet the customer by name.");
		expect(segment("toolDeclarations")).toContain("get_order");
		expect(segment("contents")).toContain("where is my order?");
	});

	it("an agent with no tools and no skills is measured without artificial merit", async () => {
		bareModel.enqueue([text("A.")]).enqueue([text("B.")]);

		const runA = await support.bare.ask({ message: "hi" });
		const runB = await support.bare.ask({ message: "hello there" });

		expect([runA, runB]).toHaveStablePrefix(0.7);
	});

	it("fails with a usable message when a single run is compared", async () => {
		stableModel.enqueue([text("Sure.")]);
		const run = await support.stable.ask({ message: "hi" });

		expect(() => expect([run]).toHaveStablePrefix(0.8)).toThrow(/at least 2 RunResults/);
	});

	it("explain() hydrates the session history, like a real run would", async () => {
		stableModel.enqueue([text("Your order 123 has shipped.")]);
		await support.stable.ask({ sessionId: "s1", message: "where is order 123?" });

		const snapshots = await app.get(AgentRunner).explain(StableAgent, { sessionId: "s1", message: "and order 456?" });
		const contents = snapshots[0]?.segments.find((entry) => entry.kind === "contents")?.text ?? "";

		// without hydration the dry run would describe a context the agent never actually sends
		expect(contents).toContain("where is order 123?");
		expect(contents).toContain("Your order 123 has shipped.");
		expect(contents).toContain("and order 456?");
	});

	it("explain() does not create the session it inspects", async () => {
		await app.get(AgentRunner).explain(StableAgent, { sessionId: "never-created", message: "hi" });

		expect(await app.get(SessionStore).get("never-created")).toBeNull();
	});

	it("explain() shows what would be sent without calling the provider", async () => {
		const snapshots = await app.get(AgentRunner).explain(StableAgent, { message: "where is my order?" });

		expect(snapshots).toHaveLength(1);
		const segment = (kind: string) => snapshots[0]?.segments.find((entry) => entry.kind === kind)?.text ?? "";
		expect(segment("systemInstruction")).toContain("You are a support agent.");
		expect(segment("toolDeclarations")).toContain("get_order");
		// the script was never touched: no model call happened
		expect(stableModel.scripts).toHaveLength(0);
	});
});

describe("Stable Prefix — diagnostics disabled", () => {
	let app: TestingModule;

	beforeEach(async () => {
		bareModel.scripts.length = 0;
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, defaultModel: "gemini-2.5-flash" }), FeatureModule],
		}).compile();
		await app.init();
	});

	afterEach(async () => {
		await app.close();
	});

	it("captures nothing and the matcher says how to turn it on", async () => {
		bareModel.enqueue([text("A.")]).enqueue([text("B.")]);
		const support = app.get(SupportService);

		const runA = await support.bare.ask({ message: "hi" });
		const runB = await support.bare.ask({ message: "hello" });

		expect(ContextCollector.getActive()).toBeUndefined();
		expect(() => expect([runA, runB]).toHaveStablePrefix(0.5)).toThrow(/diagnostics: true/);
	});
});
