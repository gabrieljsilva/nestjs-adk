import { AgentName } from "../../domain/agent/agent-name";
import type { RuntimeServices } from "../../runtime/composition/runtime-services";
import { AgentHandle } from "./agent-handle";

/**
 * Every agent the application declared, as handles it can hold.
 *
 * A handle is created on demand and remembered, so two injections of the same agent are
 * the same object. Asking for an agent nobody declared fails here rather than at the first
 * question, with the catalog saying which names exist.
 */
export class AgentRegistry {
	private readonly handles = new Map<string, AgentHandle>();

	public constructor(private readonly runtime: RuntimeServices) {}

	public get names(): readonly string[] {
		return this.runtime.catalog.names;
	}

	public get(name: string): AgentHandle {
		const agent = this.runtime.catalog.findOrFail(AgentName.from(name)).name;
		const existing = this.handles.get(agent.value);
		if (existing !== undefined) return existing;

		const handle = new AgentHandle(agent, this.runtime);
		this.handles.set(agent.value, handle);
		return handle;
	}
}
