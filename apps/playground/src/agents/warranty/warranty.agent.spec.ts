import {
	AdkAgent,
	AgentName,
	AgentRunId,
	Clock,
	IdGenerator,
	Instant,
	SessionId,
	ToolCallId,
	ToolContext,
} from "@nestjs-adk/core";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { TicketRepository } from "../../aftersales/ticket.repository";
import { AppModule } from "../../app.module";
import { StoreDatabase } from "../../shared/store-database";
import { StoreSeed } from "../../shared/store-seed";
import { WarrantyAgent } from "../warranty/warranty.agent";

describe("WarrantyAgent", () => {
	it("is an agent an application can inject as itself", async () => {
		let nextId = 0;
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.overrideProvider(IdGenerator)
			.useValue({ next: () => String(++nextId) })
			.compile();
		module.get(StoreSeed).apply();
		const agent = module.get(WarrantyAgent);
		expect(agent).toBeInstanceOf(AdkAgent);
	});

	it("opens a ticket and answers what a run needs to carry on", async () => {
		let nextId = 0;
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.overrideProvider(IdGenerator)
			.useValue({ next: () => String(++nextId) })
			.compile();
		module.get(StoreSeed).apply();
		const agent = module.get(WarrantyAgent);
		expect(
			agent.openTicket(
				{ orderId: "A-1042", reason: "broken controller" },
				new ToolContext(
					SessionId.from("session-9"),
					AgentRunId.from("run-1"),
					AgentName.from("warranty"),
					ToolCallId.from("call-1"),
				),
			),
		).toEqual({
			ticketId: "T-1",
			orderId: "A-1042",
		});
	});

	it("records the conversation the complaint came out of, without being told the address", async () => {
		let nextId = 0;
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.overrideProvider(IdGenerator)
			.useValue({ next: () => String(++nextId) })
			.compile();
		module.get(StoreSeed).apply();
		const agent = module.get(WarrantyAgent);
		const tickets = module.get(TicketRepository);
		agent.openTicket(
			{ orderId: "A-1042", reason: "broken left analog stick" },
			new ToolContext(
				SessionId.from("session-9"),
				AgentRunId.from("run-1"),
				AgentName.from("warranty"),
				ToolCallId.from("call-1"),
			),
		);

		expect(tickets.findByOrder("A-1042").at(0)?.sessionId).toBe("session-9");
	});

	it("opens a ticket outside a conversation, for a caller that is not a run", async () => {
		let nextId = 0;
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.overrideProvider(IdGenerator)
			.useValue({ next: () => String(++nextId) })
			.compile();
		module.get(StoreSeed).apply();
		const agent = module.get(WarrantyAgent);
		const tickets = module.get(TicketRepository);
		agent.openTicket({ orderId: "A-1042", reason: "without a conversation" });

		expect(tickets.findByOrder("A-1042").at(0)?.fromConversation).toBe(false);
	});

	it("tells the run the order does not exist instead of failing it", async () => {
		let nextId = 0;
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.overrideProvider(IdGenerator)
			.useValue({ next: () => String(++nextId) })
			.compile();
		module.get(StoreSeed).apply();
		const agent = module.get(WarrantyAgent);
		const answer = agent.openTicket(
			{ orderId: "A-9", reason: "broken" },
			new ToolContext(
				SessionId.from("session-9"),
				AgentRunId.from("run-1"),
				AgentName.from("warranty"),
				ToolCallId.from("call-1"),
			),
		);

		expect(Reflect.get(Object(answer), "error")).toContain("A-9");
	});

	it("holds the warranty policy as text, and it asks for a photo and nothing else", async () => {
		let nextId = 0;
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.overrideProvider(IdGenerator)
			.useValue({ next: () => String(++nextId) })
			.compile();
		module.get(StoreSeed).apply();
		const agent = module.get(WarrantyAgent);
		expect(agent.warrantyPolicy()).toContain("photo");
		expect(agent.warrantyPolicy()).not.toContain("receipt");
	});
});
