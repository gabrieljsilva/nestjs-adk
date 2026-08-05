import { Injectable } from "@nestjs/common";
import { AGENT_METADATA } from "../../../adapters/nest/metadata-keys";
import type { AgentOptions } from "../agent-options";

/** Nest's own decorator takes a constructor; a `ClassDecorator` is handed the same thing. */
function markInjectable(target: object): void {
	const decorate = Injectable();
	decorate(Object(target));
}

/**
 * Declares an agent, and makes the class a provider so NestJS builds it with its
 * dependencies. Everything the decorator writes is read once, after the container is
 * ready: a decorator that resolved anything itself would resolve it too early.
 */
export function Agent(options: AgentOptions): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(AGENT_METADATA, options, target);
		markInjectable(target);
	};
}
