import { describe, expect, it } from "vitest";
import { AgentId } from "../../common/identity/agent-id";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { CorrelationId } from "../../common/identity/correlation-id";
import { EventId } from "../../common/identity/event-id";
import { Instant } from "../../common/time/instant";
import { UserMessageReceived } from "./catalog/user-message-received";
import { EventCorrelation } from "./event-correlation";
import { EventHeader } from "./event-header";
import { SessionEventCodecs } from "./session-event-codecs";

const CATALOG_SIZE = 19;

const header = new EventHeader(
	EventId.from("e-1"),
	Instant.fromIso("2026-01-01T00:00:00.000Z"),
	new EventCorrelation(AgentRunId.from("run-1"), AgentId.from("support"), CorrelationId.from("corr-1")),
);

describe("SessionEventCodecs", () => {
	it("registers one codec for every event in the catalog", () => {
		expect(SessionEventCodecs.registry().types).toHaveLength(CATALOG_SIZE);
	});

	it("registers each type exactly once", () => {
		const types = SessionEventCodecs.registry().types;

		expect(new Set(types).size).toBe(types.length);
	});

	it("round trips an event through the registry it built", () => {
		const registry = SessionEventCodecs.registry();
		const codec = registry.codecFor(UserMessageReceived.TYPE);

		const decoded = registry.decode(
			UserMessageReceived.TYPE,
			1,
			codec.encode(new UserMessageReceived(header, "hi")),
			header,
		);

		expect(decoded).toBeInstanceOf(UserMessageReceived);
	});

	it("builds a fresh registry each time, so one runtime never edits another one", () => {
		expect(SessionEventCodecs.registry()).not.toBe(SessionEventCodecs.registry());
	});
});
