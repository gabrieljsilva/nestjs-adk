import type { ModelResolver } from "../../contracts/model/model-resolver.contract";
import type { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import { ModelCapability } from "../../domain/model/descriptor/model-capability.value-object";
import { UnsupportedCapabilityError } from "../../domain/model/errors/unsupported-capability.error";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import type { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";
import type { AskInput } from "../../domain/session/input/ask-input.command";
import type { ModelRunOutcome } from "./model-run-outcome.value-object";
import type { ModelRunCommand } from "./model-run.command";
import { ModelRunner } from "./model-runner.service";

export class ModelService {
	public constructor(
		public readonly resolver: ModelResolver,
		private readonly runner: ModelRunner = new ModelRunner(),
	) {}

	public resolve(definition: AgentDefinition, requested?: LlmModel, input?: AskInput): LlmModel {
		const model = requested ?? this.resolver.resolve(definition);
		this.assertCanSee(model, input?.hasAttachments === true);
		return model;
	}

	public async run(command: ModelRunCommand): Promise<ModelRunOutcome> {
		return await this.runner.run(command);
	}

	public stream(command: ModelRunCommand): AsyncGenerator<ModelChunk, ModelRunOutcome> {
		return this.runner.stream(command);
	}

	private assertCanSee(model: LlmModel, hasAttachments: boolean): void {
		if (!hasAttachments) return;
		const descriptor = model.descriptor();
		if (descriptor.capabilities.supports(ModelCapability.MEDIA_INPUT)) return;
		throw new UnsupportedCapabilityError(descriptor.identity.toString(), ModelCapability.MEDIA_INPUT.name);
	}
}
