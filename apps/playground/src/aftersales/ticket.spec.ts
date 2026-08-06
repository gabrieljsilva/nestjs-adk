import { describe, expect, it } from "vitest";
import { Ticket } from "./ticket";

describe("Ticket", () => {
	it("keeps what was complained about and when", () => {
		const ticket = Ticket.of("T-1", "A-1042", "controle chegou quebrado", "2026-08-05T00:00:00.000Z");

		expect(ticket.id).toBe("T-1");
		expect(ticket.orderId).toBe("A-1042");
		expect(ticket.reason).toBe("controle chegou quebrado");
		expect(ticket.openedAt).toBe("2026-08-05T00:00:00.000Z");
	});

	it("points at the conversation it came out of", () => {
		const ticket = Ticket.of("T-1", "A-1042", "quebrado", "2026-08-05T00:00:00.000Z", "session-9");

		expect(ticket.fromConversation).toBe(true);
		expect(ticket.sessionId).toBe("session-9");
	});

	it("has no conversation when it was opened on the site", () => {
		expect(Ticket.of("T-1", "A-1042", "quebrado", "2026-08-05T00:00:00.000Z").fromConversation).toBe(false);
	});
});
