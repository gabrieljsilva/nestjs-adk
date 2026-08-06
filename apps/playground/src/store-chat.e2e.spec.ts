import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import {
	AgentMaxIterationsError,
	AgentRegistry,
	type ContextBlock,
	ContextSummarizer,
	RunLimits,
	TokenThresholdCompactionPolicy,
	UnsupportedCapabilityError,
} from "@nestjs-adk/core";
import type { AdkTestBed, ScriptedModel } from "@nestjs-adk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { OrderRepository } from "./aftersales/order.repository";
import { TicketRepository } from "./aftersales/ticket.repository";
import { BillingAgent } from "./agents/billing.agent";
import { ConciergeAgent } from "./agents/concierge.agent";
import { SalesAgent } from "./agents/sales.agent";
import { WarrantyAgent } from "./agents/warranty.agent";
import { Attachment } from "./chat/attachment";
import { InspectSessionUseCase } from "./chat/inspect-session.use-case";
import { SendMessageUseCase } from "./chat/send-message.use-case";
import { type StoreScripts, scriptedStore } from "./testing/store-bed.fixture";

const PHOTO = "https://files.example.test/controle-quebrado.jpg";
const ORDER = "A-1042";

/** Says what it replaced, so a test can find the summary among the messages without a provider. */
class NamingSummarizer extends ContextSummarizer {
	public async summarize(blocks: readonly ContextBlock[]): Promise<string> {
		return `RESUMO DE ${blocks.length} TRECHOS`;
	}
}

let bed: AdkTestBed;

afterEach(async () => {
	await bed?.close();
});

/**
 * The whole application, with a script behind each agent.
 *
 * Everything here is the real thing except the models: the container, the decorators, the
 * catalog, SQLite, the journal and the approval policy. A script per agent is what makes a
 * transfer or a delegation readable, because the turns of one sector can no longer be
 * consumed by another. What none of it proves is that a real provider answers this way,
 * and that is what the agent suites are for.
 */
async function boot(scripts: StoreScripts, limits?: RunLimits): Promise<AdkTestBed> {
	const builder = scriptedStore(scripts);
	bed = await (limits === undefined ? builder : builder.withRuntime({ limits })).boot();
	return bed;
}

function orders(): OrderRepository {
	return bed.get(OrderRepository);
}

describe("the store, end to end", () => {
	it("binds every sector to the runtime, by class and by name", async () => {
		await boot({});
		const registry = bed.get(AgentRegistry);

		expect(bed.get(ConciergeAgent).agentName.value).toBe("concierge");
		expect(bed.get(SalesAgent).agentName.value).toBe("sales");
		expect(registry.get("warranty").name.value).toBe("warranty");
		expect(registry.get("billing").name.value).toBe("billing");
	});

	it("runs a tool through the use case and SQLite", async () => {
		await boot({
			sales: (script) =>
				script.mockToolCall("search_games", { term: "ps5" }).mockText("Temos Elden Ring Nightreign para PS5."),
		});

		const run = await bed.agent(SalesAgent).ask("quais jogos de ps5 vocês têm?");

		expect(run).toHaveRunTool("search_games", { term: "ps5" });
		expect(run.text).toBe("Temos Elden Ring Nightreign para PS5.");
	});

	it("shows the model the number the catalog answered, not one it made up", async () => {
		await boot({
			sales: (script) =>
				script
					.mockToolCall("quote_game", { slug: "elden-ring-nightreign", quantity: 3 })
					.mockText("Três cópias saem por 755,73 reais."),
		});

		const run = await bed.agent(SalesAgent).ask("quanto sai três cópias de Elden Ring Nightreign?");

		expect(JSON.stringify(run.callsTo("quote_game").at(0)?.output)).toContain("755.73");
		expect(JSON.stringify(bed.script(SalesAgent)?.requests.at(-1))).toContain("755.73");
	});

	it("holds the refund in front of a human before any money leaves", async () => {
		await boot({ billing: (script) => script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }) });

		const run = await bed.agent(BillingAgent).ask(`devolve o valor do pedido ${ORDER}`);

		expect(run).toAwaitApproval("issue_refund");
		expect(run).not.toHaveRunTool("issue_refund");
		expect(orders().findById(ORDER)?.isRefunded).toBe(false);
	});

	it("lets the money leave once a human said so, and records it", async () => {
		await boot({
			billing: (script) =>
				script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("Reembolso de 349 reais feito."),
		});
		const billing = bed.agent(BillingAgent);
		await billing.ask(`devolve o valor do pedido ${ORDER}`);

		const resumed = await billing.approve("issue_refund", "gerente@nebula.test");

		expect(resumed).toHaveStatus("completed");
		expect(resumed).toHaveRunTool("issue_refund");
		expect(orders().findById(ORDER)?.refundedCents).toBe(34_900);
	});

	it("keeps the money when a human refused, and the conversation carries on", async () => {
		await boot({
			billing: (script) =>
				script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("Entendi, não vou devolver."),
		});
		const billing = bed.agent(BillingAgent);
		await billing.ask(`devolve o valor do pedido ${ORDER}`);

		const resumed = await billing.reject("fora da política", "issue_refund");

		expect(resumed).toHaveStatus("completed");
		expect(resumed).toHaveDeniedTool("issue_refund");
		expect(orders().findById(ORDER)?.isRefunded).toBe(false);
		expect(JSON.stringify(bed.script(BillingAgent)?.requests.at(-1))).toContain("fora da política");
	});

	it("hands the conversation to the sector that owns it", async () => {
		await boot({
			concierge: (script) =>
				script.mockToolCall("transfer_to_agent", { agentName: "warranty" }).mockText("Passei para a assistência."),
			warranty: (script) => script.mockText("Vamos cuidar do seu controle."),
		});

		const result = await bed.get(SendMessageUseCase).execute("meu controle chegou quebrado");
		const session = await bed.get(InspectSessionUseCase).execute(result.sessionId.value);

		expect(session.activeAgent.value).toBe("warranty");
		expect(bed.events).toHaveTransferredTo("warranty");
	});

	it("asks another sector one question without giving the conversation away", async () => {
		await boot({
			warranty: (script) =>
				script
					.mockToolCall("delegate_to_agent", { agentName: "billing", task: "qual o teto de reembolso do plano gold?" })
					.mockText("O plano gold devolve até 1437 reais."),
			billing: (script) => script.mockText("O teto do gold é 1437 reais."),
		});

		const run = await bed.agent(WarrantyAgent).ask("quanto o plano gold pode receber de volta?");
		const session = await bed.get(InspectSessionUseCase).execute(run.sessionId.value);

		expect(run).toHaveDelegatedTo("billing");
		expect(run.events.types).toContain("delegation.completed");
		expect(session.activeAgent.value).toBe("warranty");
	});

	it("answers a tool that cannot do what it was asked, instead of failing the run", async () => {
		await boot({
			warranty: (script) =>
				script.mockToolCall("open_ticket", { orderId: "A-9", reason: "quebrado" }).mockText("Não achei esse pedido."),
		});

		const run = await bed.agent(WarrantyAgent).ask("abre chamado do pedido A-9");

		expect(run).toHaveStatus("completed");
		expect(run.events.ran("open_ticket")).toBe(1);
		expect(bed.get(TicketRepository).findByOrder("A-9")).toEqual([]);
	});

	it("opens the ticket pointing at the conversation it came out of", async () => {
		await boot({
			warranty: (script) =>
				script.mockToolCall("open_ticket", { orderId: ORDER, reason: "controle quebrado" }).mockText("Chamado aberto."),
		});

		const run = await bed.agent(WarrantyAgent).ask(`abre chamado do pedido ${ORDER}`);

		expect(bed.get(TicketRepository).findByOrder(ORDER).at(0)?.sessionId).toBe(run.sessionId.value);
	});

	it("stops a conversation that will not stop", async () => {
		await boot(
			{
				sales: (script) => {
					for (let turn = 0; turn < 5; turn += 1) script.mockToolCall("search_games", { term: "ps5" });
				},
			},
			RunLimits.of(2),
		);

		await expect(bed.agent(SalesAgent).ask("lista tudo, de novo e de novo")).rejects.toBeInstanceOf(
			AgentMaxIterationsError,
		);
	});

	it("refuses a photo when the model behind the store cannot look at one", async () => {
		await boot({});

		await expect(
			bed.get(SendMessageUseCase).execute("chegou assim", undefined, [Attachment.of(PHOTO, "image/jpeg")]),
		).rejects.toBeInstanceOf(UnsupportedCapabilityError);
	});

	it("keeps the conversation in the same database as the store", async () => {
		await boot({ concierge: (script) => script.mockText("bom dia").mockText("continuando") });

		const first = await bed.get(SendMessageUseCase).execute("bom dia");
		const second = await bed.get(SendMessageUseCase).execute("continuando", first.sessionId.value);
		const session = await bed.get(InspectSessionUseCase).execute(first.sessionId.value);

		expect(second.sessionId.value).toBe(first.sessionId.value);
		expect(session.revision.value).toBeGreaterThan(1);
		expect(session.id.value).toBe(first.sessionId.value);
	});
});

/**
 * A conversation that outgrew the window, without writing one.
 *
 * The size of a context is whatever the provider said it was, so a script that claims a
 * large prompt is a large prompt as far as the runtime is concerned. That is the whole of
 * the mock: everything else here is the store, its policy and its journal.
 *
 * What has to be true is that the model stops being sent the oldest turns, that a summary
 * arrives in their place, and that nothing was deleted: compaction shortens what is sent,
 * never what was recorded, and a session that lost its history to a token ceiling would be
 * a bug nobody notices until an audit.
 */
describe("the store, on a conversation too long to send", () => {
	/**
	 * What the provider claims the prompt cost, and it is the number that makes this readable.
	 *
	 * A policy sets its target in tokens, and the strategy has to reach it in characters, so
	 * the target lands at roughly `targetTokens x (characters / reported tokens)`. Under that
	 * figure sits a floor compaction may never touch: the agent's prompt and the tool
	 * descriptions. Claiming very few characters per token pushes the target below that floor,
	 * nothing can reach it, and the strategy correctly gives the summary up rather than the
	 * run, which is a green test proving nothing.
	 */
	const REPORTED_TOKENS = 1_500;
	/**
	 * Long enough that the conversation dwarfs the agent's own prompt.
	 *
	 * The target is a share of everything that will be sent, and the prompt and the tool
	 * descriptions are part of that while being the two things compaction may not touch.
	 */
	const DETAIL = "detalhe ".repeat(60);
	/** Enough recent turns kept that a test can tell dropping the oldest from dropping everything. */
	const KEEP_RECENT = 4;

	let scripted: ScriptedModel;

	async function booted(reportedTokens: number): Promise<void> {
		bed = await scriptedStore({ concierge: (script) => script.reportsPromptTokens(reportedTokens) })
			.withRuntime({
				compaction: new TokenThresholdCompactionPolicy(2_000, 1_800, KEEP_RECENT),
				summarizer: new NamingSummarizer(),
			})
			.boot();
		const found = bed.script(ConciergeAgent);
		if (found === undefined) throw new Error("the concierge was booted without a script");
		scripted = found;
	}

	async function conversationOf(turns: number): Promise<string> {
		await booted(REPORTED_TOKENS);

		let sessionId: string | undefined;
		for (let turn = 0; turn < turns; turn += 1) {
			scripted.mockText(`resposta ${turn} ${DETAIL}`);
			const result = await bed.get(SendMessageUseCase).execute(`pergunta ${turn} ${DETAIL}`, sessionId);
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
		expect(lastPrompt()).toContain("pergunta 5");
	});

	/** The journal is the record. Compaction is about the prompt and must not touch it. */
	it("leaves every turn in the session, including the ones it stopped sending", async () => {
		const sessionId = await conversationOf(6);

		const session = await bed.get(InspectSessionUseCase).execute(sessionId);

		expect(session.revision.value).toBeGreaterThan(4);
	});

	it("compacts nothing while the conversation still fits", async () => {
		await booted(100);
		scripted.mockText("a").mockText("b");

		const first = await bed.get(SendMessageUseCase).execute("pergunta 0");
		await bed.get(SendMessageUseCase).execute("pergunta 1", first.sessionId.value);

		expect(lastPrompt()).toContain("pergunta 0");
	});
});
