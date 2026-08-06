import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import {
	AgentMaxIterationsError,
	AgentRegistry,
	type AgentResult,
	type ContextBlock,
	ContextSummarizer,
	RunLimits,
	TokenThresholdCompactionPolicy,
	UnsupportedCapabilityError,
} from "@nestjs-adk/core";
import { ScriptedModel } from "@nestjs-adk/testing";
import type { TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderRepository } from "./aftersales/order.repository";
import { TicketRepository } from "./aftersales/ticket.repository";
import { BillingAgent } from "./agents/billing.agent";
import { ConciergeAgent } from "./agents/concierge.agent";
import { SalesAgent } from "./agents/sales.agent";
import { WarrantyAgent } from "./agents/warranty.agent";
import { ApproveToolCallUseCase } from "./chat/approve-tool-call.use-case";
import { Attachment } from "./chat/attachment";
import { InspectSessionUseCase } from "./chat/inspect-session.use-case";
import { RejectToolCallUseCase } from "./chat/reject-tool-call.use-case";
import { SendMessageUseCase } from "./chat/send-message.use-case";
import { RecordedEvents } from "./testing/recorded-events.fixture";
import { bootStore } from "./testing/store-app.fixture";

const PHOTO = "https://files.example.test/controle-quebrado.jpg";

/** Says what it replaced, so a test can find the summary among the messages without a provider. */
class NamingSummarizer extends ContextSummarizer {
	public async summarize(blocks: readonly ContextBlock[]): Promise<string> {
		return `RESUMO DE ${blocks.length} TRECHOS`;
	}
}

let app: TestingModule;
let model: ScriptedModel;
let events: RecordedEvents;

/**
 * The whole application, with the provider replaced by a script.
 *
 * Everything here is the real thing except the model: the container, the decorators, the
 * catalog, SQLite, the journal and the approval policy. What a scripted model buys is
 * being able to say what the conversation looks like, which is what makes a refusal or a
 * loop cheap to prove. What it cannot prove is that a real provider answers this way,
 * and that is what the agent suites are for.
 */
async function boot(limits?: RunLimits): Promise<void> {
	model = new ScriptedModel("scripted");
	events = new RecordedEvents();
	app = await bootStore(model, { consumers: [events], limits });
}

function orders(): OrderRepository {
	return app.get(OrderRepository);
}

/** The call a suspended run is waiting on, which is what a human answers about. */
function pending(result: AgentResult): string {
	const call = result.awaiting.at(0);
	if (call === undefined) throw new Error("the run is not waiting for anything");
	return call.callId.value;
}

beforeEach(async () => {
	await boot();
});

afterEach(async () => {
	await app.close();
});

describe("the store, end to end", () => {
	it("binds every sector to the runtime, by class and by name", () => {
		const registry = app.get(AgentRegistry);

		expect(app.get(ConciergeAgent).agentName.value).toBe("concierge");
		expect(app.get(SalesAgent).agentName.value).toBe("sales");
		expect(registry.get("warranty").name.value).toBe("warranty");
		expect(registry.get("billing").name.value).toBe("billing");
	});

	it("runs a tool through the use case and SQLite", async () => {
		model.mockToolCall("search_games", { term: "ps5" }).mockText("Temos Elden Ring Nightreign para PS5.");

		const result = await app.get(SalesAgent).ask("quais jogos de ps5 vocês têm?");

		expect(model).toCallTool("search_games");
		expect(events.toolsRun).toContain("search_games");
		expect(result.text).toBe("Temos Elden Ring Nightreign para PS5.");
	});

	it("shows the model the number the catalog answered, not one it made up", async () => {
		model
			.mockToolCall("quote_game", { slug: "elden-ring-nightreign", quantity: 3 })
			.mockText("Três cópias saem por 755,73 reais.");

		await app.get(SalesAgent).ask("quanto sai três cópias de Elden Ring Nightreign?");

		expect(JSON.stringify(model.requests.at(-1))).toContain("755.73");
	});

	it("holds the refund in front of a human before any money leaves", async () => {
		model.mockToolCall("issue_refund", { orderId: "A-1042", amountBrl: 349 });

		const result = await app.get(BillingAgent).ask("devolve o valor do pedido A-1042");

		expect(result).toAwaitApproval("issue_refund");
		expect(orders().findById("A-1042")?.isRefunded).toBe(false);
		expect(events.toolsRun).not.toContain("issue_refund");
	});

	it("lets the money leave once a human said so, and records it", async () => {
		model.mockToolCall("issue_refund", { orderId: "A-1042", amountBrl: 349 });
		const suspended = await app.get(BillingAgent).ask("devolve o valor do pedido A-1042");
		model.mockText("Reembolso de 349 reais feito.");

		const resumed = await app
			.get(ApproveToolCallUseCase)
			.execute(suspended.sessionId.value, pending(suspended), "gerente@nebula.test");

		expect(resumed.status.name).toBe("completed");
		expect(orders().findById("A-1042")?.refundedCents).toBe(34_900);
		expect(events.ran("issue_refund")).toBe(1);
	});

	it("keeps the money when a human refused, and the conversation carries on", async () => {
		model.mockToolCall("issue_refund", { orderId: "A-1042", amountBrl: 349 });
		const suspended = await app.get(BillingAgent).ask("devolve o valor do pedido A-1042");
		model.mockText("Entendi, não vou devolver.");

		const resumed = await app
			.get(RejectToolCallUseCase)
			.execute(suspended.sessionId.value, pending(suspended), "fora da política", "gerente@nebula.test");

		expect(resumed.status.name).toBe("completed");
		expect(orders().findById("A-1042")?.isRefunded).toBe(false);
		expect(JSON.stringify(model.requests.at(-1))).toContain("fora da política");
	});

	it("hands the conversation to the sector that owns it", async () => {
		model.mockToolCall("transfer_to_agent", { agentName: "warranty" }).mockText("Passei para a assistência.");

		const result = await app.get(SendMessageUseCase).execute("meu controle chegou quebrado");
		const session = await app.get(InspectSessionUseCase).execute(result.sessionId.value);

		expect(session.activeAgent.value).toBe("warranty");
		expect(events.types).toContain("agent.transferred");
	});

	it("asks another sector one question without giving the conversation away", async () => {
		model
			.mockToolCall("delegate_to_agent", { agentName: "billing", task: "qual o teto de reembolso do plano gold?" })
			.mockText("O teto do gold é 1437 reais.")
			.mockText("O plano gold devolve até 1437 reais.");

		const result = await app.get(WarrantyAgent).ask("quanto o plano gold pode receber de volta?");
		const session = await app.get(InspectSessionUseCase).execute(result.sessionId.value);

		expect(events.types).toContain("delegation.started");
		expect(events.types).toContain("delegation.completed");
		expect(session.activeAgent.value).toBe("warranty");
	});

	it("answers a tool that cannot do what it was asked, instead of failing the run", async () => {
		model.mockToolCall("open_ticket", { orderId: "A-9", reason: "quebrado" }).mockText("Não achei esse pedido.");

		const result = await app.get(WarrantyAgent).ask("abre chamado do pedido A-9");

		expect(result.status.name).toBe("completed");
		expect(events.ran("open_ticket")).toBe(1);
		expect(app.get(TicketRepository).findByOrder("A-9")).toEqual([]);
	});

	it("opens the ticket pointing at the conversation it came out of", async () => {
		model.mockToolCall("open_ticket", { orderId: "A-1042", reason: "controle quebrado" }).mockText("Chamado aberto.");

		const result = await app.get(WarrantyAgent).ask("abre chamado do pedido A-1042");

		expect(app.get(TicketRepository).findByOrder("A-1042").at(0)?.sessionId).toBe(result.sessionId.value);
	});

	it("stops a conversation that will not stop", async () => {
		await app.close();
		await boot(RunLimits.of(2));
		for (let turn = 0; turn < 5; turn += 1) model.mockToolCall("search_games", { term: "ps5" });

		await expect(app.get(SalesAgent).ask("lista tudo, de novo e de novo")).rejects.toBeInstanceOf(
			AgentMaxIterationsError,
		);
	});

	it("refuses a photo when the model behind the store cannot look at one", async () => {
		await expect(
			app.get(SendMessageUseCase).execute("chegou assim", undefined, [Attachment.of(PHOTO, "image/jpeg")]),
		).rejects.toBeInstanceOf(UnsupportedCapabilityError);
	});

	it("keeps the conversation in the same database as the store", async () => {
		const first = await app.get(SendMessageUseCase).execute("bom dia");

		const second = await app.get(SendMessageUseCase).execute("continuando", first.sessionId.value);
		const session = await app.get(InspectSessionUseCase).execute(first.sessionId.value);

		expect(second.sessionId.value).toBe(first.sessionId.value);
		expect(session.revision.value).toBeGreaterThan(1);
		expect(session.id.value).toBe(first.sessionId.value);
	});
});

/**
 * A conversation that outgrew the window, without writing one.
 *
 * The size of a context is whatever the provider said it was, so a script that claims a
 * large prompt is a large prompt as far as the runtime is concerned. That is the whole
 * of the mock: everything else here is the store, its policy and its journal.
 *
 * What has to be true is that the model stops being sent the oldest turns, that a summary
 * arrives in their place, and that nothing was deleted: compaction shortens what is sent,
 * never what was recorded, and a session that lost its history to a token ceiling would
 * be a bug nobody notices until an audit.
 */
describe("the store, on a conversation too long to send", () => {
	const OVER_THE_CEILING = 2_500;
	/**
	 * Long enough that the conversation dwarfs the agent's own prompt.
	 *
	 * The target is a share of everything that will be sent, and the prompt and the tool
	 * descriptions are part of that while being the two things compaction may not touch.
	 * A short conversation next to a long prompt is a target no amount of dropping can
	 * reach, and then the summary is given up too, which is the strategy behaving
	 * correctly and the test proving nothing.
	 */
	const DETAIL = "detalhe ".repeat(60);
	let compacted: TestingModule;
	let scripted: ScriptedModel;

	afterEach(async () => {
		await compacted?.close();
	});

	async function booted(promptTokens: number): Promise<void> {
		scripted = new ScriptedModel("scripted").reportsPromptTokens(promptTokens);
		compacted = await bootStore(scripted, {
			compaction: new TokenThresholdCompactionPolicy(2_000, 1_800, 1),
			summarizer: new NamingSummarizer(),
		});
	}

	async function conversationOf(turns: number): Promise<string> {
		await booted(OVER_THE_CEILING);

		let sessionId: string | undefined;
		for (let turn = 0; turn < turns; turn += 1) {
			scripted.mockText(`resposta ${turn} ${DETAIL}`);
			const result = await compacted.get(SendMessageUseCase).execute(`pergunta ${turn} ${DETAIL}`, sessionId);
			sessionId = result.sessionId.value;
		}
		return sessionId ?? "";
	}

	function lastPrompt(): string {
		const request = scripted.requests.at(-1);
		return (request?.messages ?? []).map((message) => message.text).join("\n");
	}

	it("sends the model a summary in place of the turns it dropped", async () => {
		await conversationOf(6);

		expect(lastPrompt()).toContain("RESUMO DE");
	});

	it("stops sending the oldest turns once the summary stands for them", async () => {
		await conversationOf(6);

		expect(lastPrompt()).not.toContain("pergunta 0");
		expect(lastPrompt()).toContain("pergunta 3");
	});

	/** The journal is the record. Compaction is about the prompt and must not touch it. */
	it("leaves every turn in the session, including the ones it stopped sending", async () => {
		const sessionId = await conversationOf(6);

		const session = await compacted.get(InspectSessionUseCase).execute(sessionId);

		expect(session.revision.value).toBeGreaterThan(4);
	});

	it("compacts nothing while the conversation still fits", async () => {
		await booted(100);
		scripted.mockText("a").mockText("b");

		const first = await compacted.get(SendMessageUseCase).execute("pergunta 0");
		await compacted.get(SendMessageUseCase).execute("pergunta 1", first.sessionId.value);

		expect(lastPrompt()).toContain("pergunta 0");
		expect(lastPrompt()).not.toContain("RESUMO DE");
	});
});
