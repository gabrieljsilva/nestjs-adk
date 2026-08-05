import type { ToolContext } from "../../domain/tool/tool-context";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ZodToolSchema } from "../schema/zod-tool-schema";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";
import { ToolMetadata } from "./tool-metadata";

/**
 * Turns what NestJS built into what a run can call.
 *
 * A tool the consumer wrote is a class with a method and a zod schema; a tool the runtime
 * runs is a `ToolDefinition` with a derived JSON Schema and a handler. This is the one
 * place that crosses between them, so nothing in the runtime knows a decorator exists and
 * nothing the consumer wrote knows a `ToolDefinition` does.
 *
 * The instance is the one NestJS already constructed, dependencies included. Nothing here
 * resolves from a container: it is handed what it needs.
 */
export class NestToolFactory {
	/** A shared tool: its own provider, with `execute` as the entry point. */
	public fromProvider(instance: object, metadata: unknown, providerName: string): ToolDefinition {
		return this.definitionOf(ToolMetadata.from(metadata, providerName), instance, "execute", providerName);
	}

	/** A tool declared on the agent itself, exclusive to it, with the method as the entry point. */
	public fromMethod(agent: object, method: string, metadata: unknown, providerName: string): ToolDefinition {
		return this.definitionOf(ToolMetadata.from(metadata, providerName, method), agent, method, providerName);
	}

	private definitionOf(metadata: ToolMetadata, target: object, method: string, providerName: string): ToolDefinition {
		const entry = Reflect.get(target, method);
		if (typeof entry !== "function") {
			throw new InvalidAgentMetadataError(providerName, `@Tool ${metadata.name} has no ${method}() to call.`);
		}
		return new ToolDefinition(
			metadata.name,
			metadata.description,
			ZodToolSchema.of(metadata.schema),
			metadata.effect,
			new BoundMethodHandler(target, method),
		);
	}
}

/**
 * Calls the method on the object NestJS built, with `this` intact.
 * That matters: a tool that reaches its own injected dependencies is the normal case, and
 * a detached function would lose them.
 */
class BoundMethodHandler extends ToolHandler {
	public constructor(
		private readonly target: object,
		private readonly method: string,
	) {
		super();
	}

	public async invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		const entry = Reflect.get(this.target, this.method);
		if (typeof entry !== "function") return undefined;
		return await Reflect.apply(entry, this.target, [args, context]);
	}
}
