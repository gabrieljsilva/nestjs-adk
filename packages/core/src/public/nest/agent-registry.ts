import { AgentName } from "../../domain/agent/agent-name";
import type { RuntimeServices } from "../../runtime/composition/runtime-services";
import type { StartedRuntime } from "../adk-runtime-host";
import { AgentHandle } from "./agent-handle";

/**
 * Every agent the application declared, as handles it can hold.
 *
 * A handle is created on demand and remembered, so two injections of the same agent are
 * the same object. Asking for an agent nobody declared fails here rather than at the first
 * question, with the catalog saying which names exist.
 *
 * It holds where the runtime lives rather than the runtime, because the container builds
 * this registry before the runtime exists. Used too early it says so, which is the same
 * answer an agent gives before the module has initialized.
 */
export class AgentRegistry {
	private readonly handles = new Map<string, AgentHandle>();

	public constructor(private readonly host: StartedRuntime) {}

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

	private get runtime(): RuntimeServices {
		return this.host.runtime;
	}
}
