import { SessionEventPublisher } from "../../contracts/session-event-publisher";

/** Default publisher: the journal is committed and nobody is listening yet. */
export class NoOpSessionEventPublisher extends SessionEventPublisher {
	public async publish(): Promise<void> {
		return undefined;
	}

	public async emit(): Promise<void> {
		return undefined;
	}
}
