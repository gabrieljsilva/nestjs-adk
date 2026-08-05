import { StructuredOutputValidator } from "../../contracts/structured-output-validator";
import { UnsupportedCapabilityError } from "../../domain/model/errors/unsupported-capability.error";
import type { LlmModel } from "../../domain/model/llm-model";
import { ModelCapability } from "../../domain/model/model-capability";
import type { ModelChunk } from "../../domain/model/model-chunk";
import type { ModelDescriptor } from "../../domain/model/model-descriptor";
import type { ModelRequest } from "../../domain/model/model-request";
import type { ModelResponse } from "../../domain/model/model-response";
import { JsonStructuredOutputValidator } from "./json-structured-output-validator";
import { MediaFit } from "./media-fit";
import { ModelChunkAggregator } from "./model-chunk-aggregator";

/**
 * Runs one model call and turns the stream into a turn.
 *
 * It executes the model it was given and nothing else: it does not choose a model, does
 * not retry and does not know a failover chain exists. That belongs to the run, which
 * knows things a single call cannot.
 *
 * `execute` is `stream` drained to the end, so the text of one is the concatenation of
 * the other by construction. Nobody has to keep the two in agreement, because there is
 * only one implementation of aggregation.
 *
 * Capabilities are checked before the request leaves. A model that never declared tools
 * fails saying so rather than answering prose to a call that expected an action. Media is
 * the exception and it is not checked: an image in history is fitted to whatever model is
 * serving this turn, because a routing decision must not end a conversation.
 */
export class ModelExecutor {
	public constructor(
		private readonly validator: StructuredOutputValidator = new JsonStructuredOutputValidator(),
		private readonly media: MediaFit = new MediaFit(),
	) {}

	public async execute(model: LlmModel, request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
		const turn = this.stream(model, request, signal);
		let step = await turn.next();
		while (step.done !== true) step = await turn.next();
		return step.value;
	}

	public async *stream(
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
			this.validator.validate(request.outputSchema, aggregator.aggregatedText),
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
