import { AgentRunner } from "../../../../packages/core/src/runtime/run/agent-runner";

export class DomainReachingIntoRuntime {
	public constructor(private readonly runner: AgentRunner) {}
}
