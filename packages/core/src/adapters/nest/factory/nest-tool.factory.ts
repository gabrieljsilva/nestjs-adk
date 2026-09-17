import type { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { ToolHandler } from "../../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { ZodToolSchema } from "../../schema/zod-tool-schema.adapter";
import { InvalidAgentMetadataError } from "../errors/invalid-agent-metadata.error";
import { ToolMetadata } from "../metadata/tool-metadata.value-object";

export class NestToolFactory {
	public fromProvider(instance: object, metadata: unknown, providerName: string): ToolDefinition {
		return this.buildDefinition(ToolMetadata.from(metadata, providerName), instance, "execute", providerName);
	}

	public fromMethod(agent: object, method: string, metadata: unknown, providerName: string): ToolDefinition {
		return this.buildDefinition(ToolMetadata.from(metadata, providerName, method), agent, method, providerName);
	}

	private buildDefinition(metadata: ToolMetadata, target: object, method: string, providerName: string): ToolDefinition {
		const entry = Reflect.get(target, method);
		if (typeof entry !== "function") {
			throw new InvalidAgentMetadataError(providerName, `@Tool ${metadata.name} has no ${method}() to call.`);
		}
		return new ToolDefinition(
			metadata.name,
			metadata.description,
			ZodToolSchema.fromSchema(metadata.schema),
			metadata.effect,
			new BoundMethodHandler(target, method),
		);
	}
}

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
