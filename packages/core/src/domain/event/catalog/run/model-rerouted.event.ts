import type { ModelIdentity } from "../../../model/descriptor/model-identity.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

export class ModelRerouted extends SessionEvent {
	public readonly type = ModelRerouted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "model.rerouted";

	public constructor(
		header: EventHeader,
		public readonly from: ModelIdentity,
		public readonly to: ModelIdentity,
		public readonly failureKind: string,
		public readonly attempt: number,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
