import { describe, expect, it } from "vitest";
import { AgentId } from "../../common/identity/agent-id";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { CorrelationId } from "../../common/identity/correlation-id";
import { EventId } from "../../common/identity/event-id";
import { SessionId } from "../../common/identity/session-id";
import { Instant } from "../../common/time/instant";
import { ModelResolver } from "../../contracts/model-resolver";
import { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentDescription } from "../../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../../domain/agent/agent-execution-policies";
import { AgentName } from "../../domain/agent/agent-name";
import { AgentTransferPolicy } from "../../domain/agent/agent-transfer-policy";
import { DeclaredAgent } from "../../domain/agent/declared-agent";
import { AgentTransferred } from "../../domain/event/catalog/agent-transferred";
import { SessionCreated } from "../../domain/event/catalog/session-created";
import { EventCorrelation } from "../../domain/event/event-correlation";
import { EventHeader } from "../../domain/event/event-header";
import { SessionEventBatch } from "../../domain/event/session-event-batch";
import type { LlmModel } from "../../domain/model/llm-model";
import { AgentRun } from "../../domain/session/agent-run";
import { ParsedArguments } from "../../domain/tool/parsed-arguments";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolSchema } from "../../domain/tool/tool-schema";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { AgentCatalog } from "../catalog/agent-catalog";
import { RunCancellation } from "../lifecycle/run-cancellation";
import { RunScopeFactory } from "../run/run-scope-factory";
import { StartedRun } from "../run/started-run";
import { AgentSwitch } from "./agent-switch";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SUPPORT = AgentName.from("support");
const BILLING = AgentName.from("billing");
const SUPPORT_MODEL = new ScriptedModel("support-model");
const BILLING_MODEL = new ScriptedModel("billing-model");

class EchoSchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object", properties: {}, additionalProperties: false };
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({});
	}
}

class EchoHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return "ok";
	}
}

function toolNamed(name: string): ToolDefinition {
	return new ToolDefinition(name, `${name} does something`, new EchoSchema(), ToolEffect.READ, new EchoHandler());
}

function agent(name: AgentName, model: LlmModel, tools: readonly ToolDefinition[]): AgentDefinition {
	return AgentDefinition.of(
		name,
		AgentDescription.from(`${name.value} agent`, name.value),
		model,
		undefined,
		AgentExecutionPolicies.of(undefined, undefined, undefined, AgentTransferPolicy.to([BILLING])),
		tools,
	);
}

/** Every agent answers on the model it declared, which is what the real resolver does by default. */
class DeclaredModelResolver extends ModelResolver {
	public resolve(definition: AgentDefinition): LlmModel {
		return definition.model;
	}
}

function header(id: string): EventHeader {
	return new EventHeader(
		EventId.from(id),
		NOW,
		new EventCorrelation(AgentRunId.from("r-1"), AgentId.from("support"), CorrelationId.from("c-1")),
	);
}

function startedRun(): StartedRun {
	const run = AgentRun.start(AgentRunId.from("r-1"), SessionId.from("s-1"), SUPPORT, NOW, CorrelationId.from("c-1"));
	return new StartedRun(run, new RunCancellation());
}

function switchOver(...definitions: readonly AgentDefinition[]): AgentSwitch {
	const catalog = AgentCatalog.of(definitions.map((definition) => new DeclaredAgent(definition, "Provider")));
	const resolver = new DeclaredModelResolver();
	return new AgentSwitch(catalog, resolver, new RunScopeFactory());
}

describe("AgentSwitch", () => {
	it("finds the agent a committed batch handed the session to", async () => {
		const batch = SessionEventBatch.of([
			new SessionCreated(header("e-1"), SUPPORT, undefined),
			new AgentTransferred(header("e-2"), SUPPORT, BILLING),
		]);

		expect(switchOver().requestedIn(batch)?.value).toBe("billing");
	});

	it("finds nobody in a batch that handed the session to nobody", async () => {
		const batch = SessionEventBatch.of([new SessionCreated(header("e-1"), SUPPORT, undefined)]);

		expect(switchOver().requestedIn(batch)).toBeUndefined();
	});

	it("takes the last handover when a turn produced more than one", async () => {
		const batch = SessionEventBatch.of([
			new AgentTransferred(header("e-1"), SUPPORT, BILLING),
			new AgentTransferred(header("e-2"), BILLING, SUPPORT),
		]);

		expect(switchOver().requestedIn(batch)?.value).toBe("support");
	});

	it("rebuilds the scope around the agent that received the session", async () => {
		const support = agent(SUPPORT, SUPPORT_MODEL, [toolNamed("lookup_order")]);
		const billing = agent(BILLING, BILLING_MODEL, [toolNamed("issue_refund")]);
		const scopes = new RunScopeFactory();
		const catalog = AgentCatalog.of([new DeclaredAgent(support, "S"), new DeclaredAgent(billing, "B")]);
		const agents = new AgentSwitch(catalog, new DeclaredModelResolver(), scopes);
		const scope = await scopes.create(support, SUPPORT_MODEL, startedRun());

		const switched = await agents.to(scope, BILLING);

		expect(switched.agent.value).toBe("billing");
		expect(switched.model).toBe(BILLING_MODEL);
		expect(switched.catalog.names).toContain("issue_refund");
		expect(switched.catalog.names).not.toContain("lookup_order");
	});

	it("keeps the run itself: same id, same limits and the same failure count", async () => {
		const support = agent(SUPPORT, SUPPORT_MODEL, [toolNamed("lookup_order")]);
		const billing = agent(BILLING, BILLING_MODEL, [toolNamed("issue_refund")]);
		const scopes = new RunScopeFactory();
		const catalog = AgentCatalog.of([new DeclaredAgent(support, "S"), new DeclaredAgent(billing, "B")]);
		const agents = new AgentSwitch(catalog, new DeclaredModelResolver(), scopes);
		const scope = await scopes.create(support, SUPPORT_MODEL, startedRun());

		const switched = await agents.to(scope, BILLING);

		expect(switched.run.id.value).toBe(scope.run.id.value);
		expect(switched.limits).toBe(scope.limits);
		expect(switched.breaker).toBe(scope.breaker);
	});
});
