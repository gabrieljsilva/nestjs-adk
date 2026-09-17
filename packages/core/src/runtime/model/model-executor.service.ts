import { StructuredOutputValidator } from "../../contracts/model/structured-output-validator.contract";
import { ModelCapability } from "../../domain/model/descriptor/model-capability.value-object";
import type { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor.value-object";
import { UnsupportedCapabilityError } from "../../domain/model/errors/unsupported-capability.error";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import type { ModelRequest } from "../../domain/model/model-request.value-object";
import type { ModelResponse } from "../../domain/model/model-response.value-object";
import type { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";
import { JsonStructuredOutputValidator } from "./json-structured-output-validator.adapter";
import { MediaFit } from "./media-fit.service";
import { ModelChunkAggregator } from "./model-chunk-aggregator.service";

export class ModelExecutor {
	public constructor(
		private readonly validator: StructuredOutputValidator = new JsonStructuredOutputValidator(),
		private readonly media: MediaFit = new MediaFit(),
	) {}

	public async execute(
		context: RunContext | undefined,
		model: LlmModel,
		request: ModelRequest,
		signal?: AbortSignal,
	): Promise<ModelResponse> {
		const turn = this.stream(context, model, request, signal);
		let step = await turn.next();
		while (step.done !== true) step = await turn.next();
		return step.value;
	}

	public async *stream(
		context: RunContext | undefined,
		model: LlmModel,
		request: ModelRequest,
		signal?: AbortSignal,
	): AsyncGenerator<ModelChunk, ModelResponse> {
		const descriptor = model.descriptor();
		this.verify(descriptor, request);
		const fitted = this.media.fit(request, descriptor);

		const aggregator = new ModelChunkAggregator();
		for await (const chunk of model.generate(fitted, signal)) {
			aggregator.accept(chunk);
			yield chunk;
		}

		if (!request.wantsStructuredOutput) return aggregator.toResponse(descriptor.identity);
		return aggregator.toResponse(
			descriptor.identity,
			this.validator.validate(context, request.outputSchema, aggregator.aggregatedText),
		);
	}

	private verify(descriptor: ModelDescriptor, request: ModelRequest): void {
		if (request.hasTools && !descriptor.capabilities.supports(ModelCapability.TOOLS)) {
			throw new UnsupportedCapabilityError(descriptor.identity.toString(), ModelCapability.TOOLS.name);
		}
		if (request.wantsStructuredOutput && !descriptor.capabilities.supports(ModelCapability.STRUCTURED_OUTPUT)) {
			throw new UnsupportedCapabilityError(descriptor.identity.toString(), ModelCapability.STRUCTURED_OUTPUT.name);
		}
	}
}
