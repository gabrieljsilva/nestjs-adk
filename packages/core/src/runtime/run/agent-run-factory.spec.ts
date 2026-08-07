import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { CorrelationId } from "../../common/identity/correlation-id";
import { SessionId } from "../../common/identity/session-id";
import { AgentName } from "../../domain/agent/agent-name";
import { FakeClock } from "../../support/fake-clock";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle";
import { AgentRunFactory } from "./agent-run-factory";

const SESSION = SessionId.from("s-1");
const SUPPORT = AgentName.from("support");

function factoryOf(): { factory: AgentRunFactory; tracker: ActiveRunTracker } {
	const tracker = new ActiveRunTracker();
	return {
		tracker,
		factory: new AgentRunFactory(new SequenceIdGenerator(), new FakeClock(), tracker, new RuntimeLifecycle(tracker)),
	};
}

describe("AgentRunFactory", () => {
	it("tracks the run it started, so a drain waits on it", () => {
		const { factory, tracker } = factoryOf();

		factory.start(SESSION, SUPPORT);

		expect(tracker.size).toBe(1);
	});

	it("releases the run when it finishes", () => {
		const { factory, tracker } = factoryOf();
		const started = factory.start(SESSION, SUPPORT);

		factory.finish(started.run);

		expect(tracker.isEmpty).toBe(true);
	});

	/**
	 * The caller's own stop button. Without it the best an application can do is walk away
	 * from the stream: the provider keeps generating, the tokens are still billed, and the
	 * journal never records that anybody cancelled anything.
	 */
	it("cancels the run when the signal the caller passed aborts", () => {
		const { factory } = factoryOf();
		const controller = new AbortController();

		const started = factory.start(SESSION, SUPPORT, controller.signal);
		controller.abort();

		expect(started.cancellation.isCancelled).toBe(true);
	});

	/** The stop button is often pressed before the first chunk, which is before the run exists. */
	it("starts cancelled when the signal had already aborted", () => {
		const { factory } = factoryOf();
		const controller = new AbortController();
		controller.abort();

		const started = factory.start(SESSION, SUPPORT, controller.signal);

		expect(started.cancellation.isCancelled).toBe(true);
	});

	it("says the caller aborted it, which is not the same ending as a shutdown", () => {
		const { factory } = factoryOf();
		const controller = new AbortController();
		const started = factory.start(SESSION, SUPPORT, controller.signal);

		controller.abort();

		expect(String(started.cancellation.signal.reason)).toContain("caller");
	});

	it("leaves a run without a signal alone", () => {
		const { factory } = factoryOf();

		expect(factory.start(SESSION, SUPPORT).cancellation.isCancelled).toBe(false);
	});

	/** An approval resumes under a new run, and the button has to work on that one too. */
	it("cancels a resumed run when the signal the decision carried aborts", () => {
		const { factory } = factoryOf();
		const controller = new AbortController();

		const started = factory.resume(SESSION, SUPPORT, AgentRunId.from("run-0"), controller.signal);
		controller.abort();

		expect(started.cancellation.isCancelled).toBe(true);
	});

	/**
	 * A child nobody is waiting for is work somebody is still paying for, and the reverse
	 * does not hold: a child that failed is an answer the parent still has to deal with.
	 */
	it("takes the children of a cancelled run with it", () => {
		const { factory } = factoryOf();
		const controller = new AbortController();
		const parent = factory.start(SESSION, SUPPORT, controller.signal);
		const child = factory.delegate(parent, AgentName.from("billing"), CorrelationId.from("d-1"));

		controller.abort();

		expect(child.cancellation.isCancelled).toBe(true);
	});
});
