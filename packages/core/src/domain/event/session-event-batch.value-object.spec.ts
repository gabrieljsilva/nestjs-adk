import { describe, expect, it } from "vitest";
import { AgentId } from "../../common/identity/agent-id.value-object";
import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { CorrelationId } from "../../common/identity/correlation-id.value-object";
import { EventId } from "../../common/identity/event-id.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { AgentName } from "../agent/agent-name.value-object";
import { SessionCreated } from "./catalog/session/session-created.event";
import { AgentTransferred } from "./catalog/transfer/agent-transferred.event";
import { DuplicatedEventIdError } from "./errors/duplicated-event-id.error";
import { EventCorrelation } from "./event-correlation.value-object";
import { EventHeader } from "./event-header.value-object";
import { SessionEventBatch } from "./session-event-batch.value-object";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SUPPORT = AgentName.from("support");
const BILLING = AgentName.from("billing");

function header(id: string): EventHeader {
	return new EventHeader(
		EventId.from(id),
		NOW,
		new EventCorrelation(AgentRunId.from("r-1"), AgentId.from("support"), CorrelationId.from("c-1")),
	);
}

describe("SessionEventBatch", () => {
	it("refuses two events sharing an id, so an idempotent append can trust it", () => {
		expect(
			() =>
				new SessionEventBatch([
					new SessionCreated(header("e-1"), SUPPORT, undefined),
					new SessionCreated(header("e-1"), SUPPORT, undefined),
				]),
		).toThrow(DuplicatedEventIdError);
	});

	it("finds the agent it handed the session to", () => {
		const batch = new SessionEventBatch([
			new SessionCreated(header("e-1"), SUPPORT, undefined),
			new AgentTransferred(header("e-2"), SUPPORT, BILLING),
		]);

		expect(batch.findTransferTarget()?.value).toBe("billing");
	});

	it("finds nobody in a batch that handed the session to nobody", () => {
		const batch = new SessionEventBatch([new SessionCreated(header("e-1"), SUPPORT, undefined)]);

		expect(batch.findTransferTarget()).toBeUndefined();
	});

	it("takes the last handover when a turn produced more than one", () => {
		const batch = new SessionEventBatch([
			new AgentTransferred(header("e-1"), SUPPORT, BILLING),
			new AgentTransferred(header("e-2"), BILLING, SUPPORT),
		]);

		expect(batch.findTransferTarget()?.value).toBe("support");
	});
});
