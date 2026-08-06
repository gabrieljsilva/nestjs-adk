import { AdkAgent, AgentName, AgentRunId, SessionId, ToolCallId, ToolContext } from "@nestjs-adk/core";
import { beforeEach, describe, expect, it } from "vitest";
import { OpenTicketUseCase } from "../aftersales/open-ticket.use-case";
import { OrderRepository } from "../aftersales/order.repository";
import { OrderService } from "../aftersales/order.service";
import { TicketRepository } from "../aftersales/ticket.repository";
import { TicketService } from "../aftersales/ticket.service";
import { countingIds, seedClock, seededStore } from "./tool-suite.fixture";
import { WarrantyAgent } from "./warranty.agent";

const SESSION = "session-9";

/** What the runtime hands a tool: the run it is running inside, and nothing more. */
function contextOf(): ToolContext {
	return new ToolContext(
		SessionId.from(SESSION),
		AgentRunId.from("run-1"),
		AgentName.from("warranty"),
		ToolCallId.from("call-1"),
	);
}

let agent: WarrantyAgent;
let tickets: TicketRepository;

beforeEach(() => {
	const database = seededStore();
	tickets = new TicketRepository(database);
	const service = new TicketService(
		new OrderService(new OrderRepository(database)),
		tickets,
		countingIds(),
		seedClock(),
	);
	agent = new WarrantyAgent(new OpenTicketUseCase(service));
});

describe("WarrantyAgent", () => {
	it("is an agent an application can inject as itself", () => {
		expect(agent).toBeInstanceOf(AdkAgent);
	});

	it("opens a ticket and answers what a run needs to carry on", () => {
		expect(agent.openTicket({ orderId: "A-1042", reason: "controle quebrado" }, contextOf())).toEqual({
			ticketId: "T-1",
			orderId: "A-1042",
		});
	});

	it("records the conversation the complaint came out of, without being told the address", () => {
		agent.openTicket({ orderId: "A-1042", reason: "analógico esquerdo quebrado" }, contextOf());

		expect(tickets.findByOrder("A-1042").at(0)?.sessionId).toBe(SESSION);
	});

	it("opens a ticket outside a conversation, for a caller that is not a run", () => {
		agent.openTicket({ orderId: "A-1042", reason: "sem conversa" });

		expect(tickets.findByOrder("A-1042").at(0)?.fromConversation).toBe(false);
	});

	it("tells the run the order does not exist instead of failing it", () => {
		const answer = agent.openTicket({ orderId: "A-9", reason: "quebrado" }, contextOf());

		expect(Reflect.get(Object(answer), "error")).toContain("A-9");
	});

	it("holds the warranty policy as text, and it asks for a photo and nothing else", () => {
		expect(agent.warrantyPolicy()).toContain("foto");
		expect(agent.warrantyPolicy()).not.toContain("nota fiscal");
	});
});
