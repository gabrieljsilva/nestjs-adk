import { describe, expect, it } from "vitest";
import { AgentId } from "../../common/identity/agent-id.value-object";
import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { CorrelationId } from "../../common/identity/correlation-id.value-object";
import { EventId } from "../../common/identity/event-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { ModelResolver } from "../../contracts/model/model-resolver.contract";
import { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import { AgentDescription } from "../../domain/agent/agent-description.value-object";
import { AgentExecutionPolicies } from "../../domain/agent/agent-execution-policies.value-object";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { AgentTransferPolicy } from "../../domain/agent/agent-transfer.policy";
import { DeclaredAgent } from "../../domain/agent/declared-agent.value-object";
import { SessionCreated } from "../../domain/event/catalog/session/session-created.event";
import { AgentTransferred } from "../../domain/event/catalog/transfer/agent-transferred.event";
import { EventCorrelation } from "../../domain/event/event-correlation.value-object";
import { EventHeader } from "../../domain/event/event-header.value-object";
import { SessionEventBatch } from "../../domain/event/session-event-batch.value-object";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import { AgentRun } from "../../domain/session/run/agent-run.entity";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../domain/tool/tool-schema.contract";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { AgentCatalog } from "../catalog/agent-catalog.service";
import { RunCancellation } from "../lifecycle/run-cancellation.service";
import { ModelService } from "../model/model.service";
import { RunScopeFactory } from "../run/scope/run-scope.factory";
import { StartedRun } from "../run/settle/started-run.value-object";
import { TransferSessionUseCase } from "./transfer-session.use-case";

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
	return new AgentDefinition({
		name: name,
		description: AgentDescription.from(`${name.value} agent`, name.value),
		model: model,
		policies: new AgentExecutionPolicies(undefined, undefined, undefined, AgentTransferPolicy.to([BILLING])),
		tools: tools,
	});
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

function switchOver(...definitions: readonly AgentDefinition[]): TransferSessionUseCase {
	const catalog = new AgentCatalog(definitions.map((definition) => new DeclaredAgent(definition, "Provider")));
	const resolver = new DeclaredModelResolver();
	return new TransferSessionUseCase(catalog, new ModelService(resolver), new RunScopeFactory());
}

describe("TransferSessionUseCase", () => {
	it("rebuilds the scope around the agent that received the session", async () => {
		const support = agent(SUPPORT, SUPPORT_MODEL, [toolNamed("lookup_order")]);
		const billing = agent(BILLING, BILLING_MODEL, [toolNamed("issue_refund")]);
		const scopes = new RunScopeFactory();
		const catalog = new AgentCatalog([new DeclaredAgent(support, "S"), new DeclaredAgent(billing, "B")]);
		const agents = new TransferSessionUseCase(catalog, new ModelService(new DeclaredModelResolver()), scopes);
		const started = startedRun();
		const context = RunContextFixture.run(started.run.sessionId, {
			agent: started.run.agent,
			runId: started.run.id.value,
		});
		const scope = await scopes.create(context, support, SUPPORT_MODEL, started);

		const switched = await agents.execute(scope, BILLING);

		expect(switched.agent.value).toBe("billing");
		expect(switched.model).toBe(BILLING_MODEL);
		expect(switched.catalog.names).toContain("issue_refund");
		expect(switched.catalog.names).not.toContain("lookup_order");
	});

	it("keeps the run itself: same id, same limits and the same failure count", async () => {
		const support = agent(SUPPORT, SUPPORT_MODEL, [toolNamed("lookup_order")]);
		const billing = agent(BILLING, BILLING_MODEL, [toolNamed("issue_refund")]);
		const scopes = new RunScopeFactory();
		const catalog = new AgentCatalog([new DeclaredAgent(support, "S"), new DeclaredAgent(billing, "B")]);
		const agents = new TransferSessionUseCase(catalog, new ModelService(new DeclaredModelResolver()), scopes);
		const started = startedRun();
		const context = RunContextFixture.run(started.run.sessionId, {
			agent: started.run.agent,
			runId: started.run.id.value,
		});
		const scope = await scopes.create(context, support, SUPPORT_MODEL, started);

		const switched = await agents.execute(scope, BILLING);

		expect(switched.run.id.value).toBe(scope.run.id.value);
		expect(switched.limits).toBe(scope.limits);
		expect(switched.breaker).toBe(scope.breaker);
	});
});
