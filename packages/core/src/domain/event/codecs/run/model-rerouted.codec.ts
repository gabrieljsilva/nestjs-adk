import { ModelIdentity } from "../../../model/descriptor/model-identity.value-object";
import { ModelRerouted } from "../../catalog/run/model-rerouted.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

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
		return new ModelIdentity(this.readText(identity, "provider"), this.readText(identity, "model"));
	}
}
