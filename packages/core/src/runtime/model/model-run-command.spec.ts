import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { AgentName } from "../../domain/agent/agent-name";
import { SequentialFailoverPolicy } from "../../domain/agent/sequential-failover-policy";
import { ModelRequest } from "../../domain/model/model-request";
import { UserMessage } from "../../domain/model/user-message";
import { StubModel } from "../../support/model/stub-model.fixture";
import { ModelRunCommand } from "./model-run-command";

const RUN = AgentRunId.from("run-1");
const AGENT = AgentName.from("support");
const model = new StubModel();
const request = new ModelRequest([new UserMessage("hi")]);

describe("ModelRunCommand", () => {
	it("carries the run, the agent, the model and the request", () => {
		const command = new ModelRunCommand(RUN, AGENT, model, request);

		expect(command.runId.value).toBe("run-1");
		expect(command.agent.value).toBe("support");
		expect(command.model).toBe(model);
		expect(command.request).toBe(request);
	});

	it("has no failover unless the agent declared one", () => {
		expect(new ModelRunCommand(RUN, AGENT, model, request).failover).toBeUndefined();
	});

	it("carries the policy and the signal when they were given", () => {
		const controller = new AbortController();
		const policy = new SequentialFailoverPolicy([]);

		const command = new ModelRunCommand(RUN, AGENT, model, request, policy, controller.signal);

		expect(command.failover).toBe(policy);
		expect(command.signal).toBe(controller.signal);
	});
});
