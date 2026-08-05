import type { ModelIdentity } from "../../model/model-identity";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/** A call moved from one model to another after a failure, on the attempt recorded here. */
export class ModelRerouted extends SessionEvent {
	public readonly type = ModelRerouted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "model.rerouted";

	// A reroute never moves cost: each call stays attributed to the model that actually served it,
	// so the tokens spent on the failed attempt remain charged to `from` and the retry to `to`.
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
