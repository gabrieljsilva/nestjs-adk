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

/**
 * The one door onto the model module: which model answers, whether it can, and running it.
 *
 * Resolving and checking are one call because they are one question. A use case asking for
 * the model of a run is asking for a model that can actually read what the run carries, and
 * splitting that into two steps leaves every caller free to forget the second one.
 */
export class ModelService {
	public constructor(
		/** Held so the composition can hand the port itself to whoever declared it. */
		public readonly resolver: ModelResolver,
		private readonly runner: ModelRunner = new ModelRunner(),
	) {}

	/**
	 * The model that answers for an agent, and which can see what the command attached.
	 *
	 * A model the caller already picked wins over the resolver, because a command naming a
	 * model is the application overriding the declaration on purpose.
	 *
	 * An attachment nobody can look at ends the command before it becomes history. This is
	 * configuration and not conversation: the application pointed an agent at a model that
	 * never declared media input and then handed it an image. Accepting the message would pay
	 * for a call that answers about nothing, and recording it would leave an image in the
	 * journal that this session can never use.
	 */
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
