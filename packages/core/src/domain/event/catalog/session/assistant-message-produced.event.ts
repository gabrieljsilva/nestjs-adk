import type { ModelIdentity } from "../../../model/descriptor/model-identity.value-object";
import type { PromptMeasurement } from "../../../model/usage/prompt-measurement.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

export class AssistantMessageProduced extends SessionEvent {
	public readonly type = AssistantMessageProduced.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public static readonly TYPE = "run.assistant-message-produced";

	public constructor(
		header: EventHeader,
		public readonly text: string,
		public readonly model: ModelIdentity,
		public readonly measurement?: PromptMeasurement,
	) {
		super(header.id, header.occurredAt, header.correlation);
	}
}
