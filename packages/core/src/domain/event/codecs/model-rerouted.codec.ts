import { ModelIdentity } from "../../model/model-identity";
import { ModelRerouted } from "../catalog/model-rerouted";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the move from one model to another, keeping both identities side by side. */
export class ModelReroutedCodec extends SessionEventCodec<ModelRerouted> {
	public readonly type = ModelRerouted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: ModelRerouted): Record<string, unknown> {
		return {
			from: { provider: event.from.provider, model: event.from.model },
			to: { provider: event.to.provider, model: event.to.model },
			failureKind: event.failureKind,
			attempt: event.attempt,
		};
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): ModelRerouted {
		return new ModelRerouted(
			header,
			this.readModel(payload, "from"),
			this.readModel(payload, "to"),
			this.readText(payload, "failureKind"),
			this.readNumber(payload, "attempt"),
		);
	}

	private readModel(payload: Readonly<Record<string, unknown>>, field: string): ModelIdentity {
		const identity = this.readRecord(payload, field);
		return ModelIdentity.of(this.readText(identity, "provider"), this.readText(identity, "model"));
	}
}
