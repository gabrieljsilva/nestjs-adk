import "@nestjs-adk/testing/matchers";
import {
	AdkAgent,
	AdkModule,
	AdkTool,
	Agent,
	Gemini,
	type RunResult,
	Skill,
	Tool,
	cacheHitRatio,
} from "@nestjs-adk/core";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { GoogleAdkEngine } from "./google-adk-engine";

// Loads the root .env (GEMINI_API_KEY) — without a key, the whole suite is skipped (CI doesn't break).
try {
	process.loadEnvFile(new URL("../../../../.env", import.meta.url).pathname);
} catch {
	// no .env — proceed with just the process environment
}

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY;
const MODEL = process.env.CACHE_TEST_MODEL ?? "gemini-2.5-flash";

/**
 * Implicit caching only engages above a provider-specific prefix size, so this agent carries the
 * kind of instruction a real support product would: policies, tone, escalation rules. A toy prompt
 * would measure nothing — the cache would never engage and the number would blame the agent.
 */
function policySection(area: string, index: number): string {
	return [
		`### ${area} policy (revision ${index})`,
		`Always confirm the customer's identity before discussing ${area}. Ask for the order number and`,
		"the e-mail used at checkout. Never read back full payment details; the last four digits are enough.",
		`When the customer disputes a ${area} decision, restate the policy in plain language, offer the`,
		"available remedies in order of cost to the company, and only escalate when none of them applies.",
		`Refunds tied to ${area} follow the 30-day window counted from delivery, not from purchase.`,
		"Partial refunds are allowed when the item was used but arrived damaged; full refunds require the",
		"item to be unused and in original packaging. Shipping costs are refunded only when the fault is ours.",
		`For ${area} issues caused by a carrier delay, the customer is entitled to expedited reshipment at`,
		"no cost, and you should offer it proactively instead of waiting for the customer to ask.",
	].join(" ");
}

const AREAS = ["billing", "shipping", "returns", "warranty", "subscription", "account access"];
/** Revisions per area — the knob that pushes the prefix past the provider's minimum cacheable size. */
const REVISIONS = 8;

function handbook(): string {
	const sections: string[] = [];
	for (let revision = 1; revision <= REVISIONS; revision++) {
		for (const area of AREAS) sections.push(policySection(area, revision));
	}
	return sections.join("\n\n");
}

const orderSchema = z.object({ orderId: z.string() });

@Tool({ name: "lookup_order", description: "Looks up an order by id.", schema: orderSchema })
class LookupOrderTool extends AdkTool<typeof orderSchema> {
	execute(input: z.infer<typeof orderSchema>) {
		return { orderId: input.orderId, status: "shipped", carrier: "UPS", eta: "2026-08-02" };
	}
}

@Agent({
	name: "support_desk",
	model: new Gemini(MODEL, { apiKey }),
	description: "Customer support desk.",
	prompt: [
		"You are the support desk for an online retailer.",
		"Answer in at most three sentences. Be warm, concrete and never invent policy.",
		"",
		handbook(),
	].join("\n"),
	tools: [LookupOrderTool],
})
class SupportAgent extends AdkAgent {
	@Skill({ name: "tone", description: "Tone of voice.", mode: "always" })
	tone() {
		return [
			"Open with a short acknowledgement of the customer's problem before answering.",
			"Never blame the customer, even when the mistake is clearly theirs.",
			"Close by stating the single next step you are taking on their behalf.",
		].join(" ");
	}

	@Skill({ name: "escalation", description: "When to escalate.", mode: "always" })
	escalation() {
		return [
			"Escalate to a human when the customer mentions legal action, a chargeback already filed,",
			"an accessibility need you cannot serve, or when the same issue comes back a third time.",
			"State plainly that you are handing over, and summarize what you already tried.",
		].join(" ");
	}
}

@Injectable()
class SupportService {
	constructor(public readonly agent: SupportAgent) {}
}

@Module({ providers: [LookupOrderTool, SupportAgent, SupportService] })
class FeatureModule {}

describe.runIf(Boolean(apiKey))(`Cache Efficiency — REAL provider (${MODEL})`, () => {
	let app: TestingModule;
	let support: SupportService;
	/** Shared by the two tests so the expensive sequence of real calls runs only once. */
	const runs: RunResult[] = [];

	const QUESTIONS = [
		"Hi, I have a question about my order.",
		"What is the refund window for a damaged item?",
		"Who pays the shipping when the carrier loses a package?",
		"When should my case be escalated to a human?",
	];

	// The expensive sequence runs ONCE, here: a test that owned it would make the next one fail with
	// "needs at least 2 runs" whenever it broke, masking the real error.
	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, diagnostics: true }), FeatureModule],
		}).compile();
		await app.init();
		support = app.get(SupportService);

		// Sequential on purpose: the first call PAYS for the prefix, and only later ones can be served
		// from it. Firing these in parallel would race the provider's cache and measure noise.
		for (const question of QUESTIONS) runs.push(await support.agent.ask({ message: question }));
	}, 180_000);

	afterAll(async () => {
		await app?.close();
	});

	it("measures cache usage over a sequence of real runs", () => {
		const report = cacheHitRatio(runs.map((run) => run.usage));
		console.log(
			`\n[REAL] cache hit ratio: ${report.available ? `${(report.ratio * 100).toFixed(1)}%` : "UNAVAILABLE"} ` +
				`(${report.cachedTokens} cached of ${report.promptTokens} prompt tokens, ${report.sampledRuns} runs)`,
		);
		console.log(`[REAL] stable prefix: ~${runs[0]?.usage.promptTokens} prompt tokens per run`);

		// Holds whatever the provider decides to report: the warm-up is out, and every remaining run
		// either fed the ratio or was set aside for saying nothing — never silently counted as zero.
		expect(report.sampledRuns + report.silentRuns).toBe(QUESTIONS.length - 1);
	});

	/**
	 * The floor is only asserted when the provider actually reported cached tokens. Implicit caching
	 * is best-effort: it takes a few calls to engage and expires on its own schedule, so a run that
	 * reports nothing means "no cache this time", not "the agent is broken". Turning that silence
	 * into 0% is precisely the false negative this feature refuses to produce.
	 */
	it("stays above the cache floor when the provider reports it", { timeout: 120_000 }, (context) => {
		const report = cacheHitRatio(runs.map((run) => run.usage));
		if (!report.available) {
			context.skip(`${MODEL} reported no cached tokens in this window — nothing to assert`);
			return;
		}

		expect(runs).toHaveCacheHitRatioAbove(0.5);
	});
});
