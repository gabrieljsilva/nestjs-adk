import { ModelIdentity } from "../../model/model-identity";
import { ModelUsage } from "../../model/model-usage";
import { PromptMeasurement } from "../../model/prompt-measurement";
import { AssistantMessageProduced } from "../catalog/assistant-message-produced";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the assistant message a model produced during a run. */
export class AssistantMessageProducedCodec extends SessionEventCodec<AssistantMessageProduced> {
	public readonly type = AssistantMessageProduced.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: AssistantMessageProduced): Record<string, unknown> {
		const encoded: Record<string, unknown> = {
			text: event.text,
			provider: event.model.provider,
			model: event.model.model,
		};
		const measurement = event.measurement;
		if (measurement === undefined) return encoded;
		encoded.inputTokens = measurement.usage.inputTokens;
		encoded.outputTokens = measurement.usage.outputTokens;
		encoded.cachedInputTokens = measurement.usage.cachedInputTokens;
		encoded.promptCharacters = measurement.characters;
		return encoded;
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): AssistantMessageProduced {
		const model = ModelIdentity.of(this.readText(payload, "provider"), this.readText(payload, "model"));
		return new AssistantMessageProduced(
			header,
			this.readText(payload, "text"),
			model,
			this.measurementOf(payload, model),
		);
	}

	/**
	 * A turn whose provider reported nothing was written without a measurement, and reads back the same way.
	 * The measurement belongs to the model that served the turn, which is already recorded
	 * here: writing it twice would only create two places for it to disagree.
	 */
	private measurementOf(
		payload: Readonly<Record<string, unknown>>,
		model: ModelIdentity,
	): PromptMeasurement | undefined {
		if (payload.inputTokens === undefined) return undefined;
		const usage = ModelUsage.of(
			this.readNumber(payload, "inputTokens"),
			this.readNumber(payload, "outputTokens"),
			this.readNumber(payload, "cachedInputTokens"),
		);
		return PromptMeasurement.from(usage, this.readNumber(payload, "promptCharacters"), model);
	}
}
