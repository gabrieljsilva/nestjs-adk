import { SessionEventPublisher } from "../event/session-event-publisher.contract";

export class NoOpSessionEventPublisher extends SessionEventPublisher {
	public async publish(): Promise<void> {
		return undefined;
	}

	public async emit(): Promise<void> {
		return undefined;
	}
}
