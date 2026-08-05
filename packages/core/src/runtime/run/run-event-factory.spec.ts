import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { CorrelationId } from "../../common/identity/correlation-id";
import { EventId } from "../../common/identity/event-id";
import { SessionId } from "../../common/identity/session-id";
import { Instant } from "../../common/time/instant";
import { AgentName } from "../../domain/agent/agent-name";
import { AgentRun } from "../../domain/session/agent-run";
import { FakeClock } from "../../support/fake-clock";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { RunEventFactory } from "./run-event-factory";

const START = Instant.fromIso("2026-01-01T00:00:00.000Z");

const run = AgentRun.start(
	AgentRunId.from("run-1"),
	SessionId.from("s-1"),
	AgentName.from("support"),
	START,
	CorrelationId.from("corr-1"),
);

function factoryOf(): RunEventFactory {
	return new RunEventFactory(new SequenceIdGenerator("e"), new FakeClock(START));
}

describe("RunEventFactory", () => {
	it("stamps the header from the injected identity and clock", () => {
		const header = factoryOf().headerFor(run);

		expect(header.id.value).toBe("e-1");
		expect(header.occurredAt.equals(START)).toBe(true);
	});

	it("gives every event of the same run a distinct id", () => {
		const factory = factoryOf();

		expect(factory.headerFor(run).id.value).not.toBe(factory.headerFor(run).id.value);
	});

	it("correlates the event to the run, its agent and its correlation id", () => {
		const correlation = factoryOf().headerFor(run).correlation;

		expect(correlation.runId.value).toBe("run-1");
		expect(correlation.agentId.value).toBe("support");
		expect(correlation.correlationId.value).toBe("corr-1");
		expect(correlation.causationId).toBeUndefined();
	});

	it("points at the event that caused this one when there is one", () => {
		const header = factoryOf().headerFor(run, EventId.from("e-0"));

		expect(header.correlation.causationId?.value).toBe("e-0");
	});
});
