import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { PricingSource } from "../../contracts/pricing-source";
import { BilledCall } from "../../domain/cost/billed-call";
import { ModelPrice } from "../../domain/cost/model-price";
import { TokenRate } from "../../domain/cost/token-rate";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelUsage } from "../../domain/model/model-usage";
import { AgentRunStatus } from "../../domain/session/agent-run-status";
import { PendingCall } from "../../domain/session/pending-call";
import { PendingTurn } from "../../domain/session/pending-turn";
import { SessionState } from "../../domain/session/session-state";
import { CostCalculator } from "../cost/cost-calculator";
import { RunCostReporter } from "../cost/run-cost-reporter";
import { RunProgress } from "./run-progress";
import { RunResultFactory } from "./run-result-factory";
import type { StartedRun } from "./started-run";

const LUNA = ModelIdentity.of("openai", "gpt-5.6-luna");
const PRICE = ModelPrice.of(TokenRate.fromUsdPerToken(1e-7), TokenRate.fromUsdPerToken(4e-7));

class KnowsLuna extends PricingSource {
	public async priceOf(model: ModelIdentity): Promise<ModelPrice | undefined> {
		return model.equals(LUNA) ? PRICE : undefined;
	}
}

const started = {
	run: { sessionId: SessionId.from("s-1"), id: AgentRunId.from("r-1") },
} as StartedRun;

const factoryOn = (source?: PricingSource) => new RunResultFactory(new RunCostReporter(new CostCalculator(), source));

describe("RunResultFactory", () => {
	it("prices the calls the run collected", async () => {
		const progress = new RunProgress(SessionState.initial());
		progress.charged(new BilledCall(LUNA, ModelUsage.of(40, 12)));

		const result = await factoryOn(new KnowsLuna()).after(started, progress);

		expect(result.cost.total.toString()).toBe("0.0000088");
		expect(result.cost.isComplete).toBe(true);
		expect(result.status).toBe(AgentRunStatus.COMPLETED);
	});

	/** Zero is the answer for a runtime that declared no source, and it is never absent. */
	it("answers a cost even with no source declared", async () => {
		const progress = new RunProgress(SessionState.initial());
		progress.charged(new BilledCall(LUNA, ModelUsage.of(40, 12)));

		const result = await factoryOn().after(started, progress);

		expect(result.cost.total.isZero).toBe(true);
		expect(result.cost.isComplete).toBe(false);
	});

	it("comes back suspended with the calls somebody has to answer for", async () => {
		const call = new PendingCall(ToolCallId.from("c-1"), "refund", {}, "destructive");
		const progress = new RunProgress(SessionState.initial().awaiting(PendingTurn.of(started.run.id, [call])));
		progress.suspend();

		const result = await factoryOn(new KnowsLuna()).after(started, progress);

		expect(result.status).toBe(AgentRunStatus.SUSPENDED);
		expect(result.awaiting).toHaveLength(1);
	});

	/** A delegation answers with what the specialist said, and prices what the child spent. */
	it("answers a delegation with the given text and nothing awaiting", async () => {
		const progress = new RunProgress(SessionState.initial());
		progress.charged(new BilledCall(LUNA, ModelUsage.of(10, 0)));

		const result = await factoryOn(new KnowsLuna()).answering(started, progress, "the specialist said so");

		expect(result.text).toBe("the specialist said so");
		expect(result.awaiting).toEqual([]);
		expect(result.status).toBe(AgentRunStatus.COMPLETED);
		expect(result.cost.total.pico).toBe(1_000_000n);
	});

	it("answers zero for a run that never called a model", async () => {
		const result = await factoryOn(new KnowsLuna()).after(started, new RunProgress(SessionState.initial()));

		expect(result.cost.total.isZero).toBe(true);
		expect(result.cost.isComplete).toBe(true);
		expect(result.cost.calls).toBe(0);
	});
});
