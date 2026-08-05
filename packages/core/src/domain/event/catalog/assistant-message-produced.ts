import type { ModelIdentity } from "../../model/model-identity";
import type { PromptMeasurement } from "../../model/prompt-measurement";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEvent } from "../session-event";

/**
 * The model answered with an assistant message during a run.
 *
 * It carries the measurement of the prompt that produced it, whenever the provider
 * reported one. That is what lets a session rehydrated hours later know how large its
 * context is: the journal is the only place an absolute size survives a restart.
 */
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
