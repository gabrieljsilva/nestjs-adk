import type { SessionId } from "../../common/identity/session-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { AppendEventsResult } from "../../contracts/storage/append-events-result.value-object";
import { AppendEventsCommand } from "../../contracts/storage/append-events.command";
import type { SessionStorage } from "../../contracts/storage/session-storage.contract";
import type { SessionEventBatch } from "../../domain/event/session-event-batch.value-object";
import type { SessionEvent } from "../../domain/event/session-event.event";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { JournalCorruptedError } from "../../domain/session/errors/journal-corrupted.error";
import type { Session } from "../../domain/session/session.entity";
import { SessionSnapshot } from "../../domain/session/state/session-snapshot.value-object";
import { SessionState } from "../../domain/session/state/session-state.value-object";
import type { SessionEventPublisher } from "../event/session-event-publisher.contract";
import { NoOpSessionEventPublisher } from "./no-op-session-event-publisher.adapter";
import { RehydratedSession } from "./rehydrated-session.value-object";
import { RevisionBucketSnapshotPolicy } from "./snapshot/revision-bucket-snapshot.policy";
import type { SnapshotPolicy } from "./snapshot/snapshot.policy";
import { StateChecksum } from "./snapshot/state-checksum.service";
import { StateProjector } from "./state-projector.service";

export class SessionRepository {
	public constructor(
		private readonly storage: SessionStorage,
		private readonly projector: StateProjector = new StateProjector(),
		private readonly publisher: SessionEventPublisher = new NoOpSessionEventPublisher(),
		private readonly checksum: StateChecksum = new StateChecksum(),
		private readonly snapshots: SnapshotPolicy = RevisionBucketSnapshotPolicy.everyFiftyEvents(),
	) {}

	public async create(context: SessionContext, session: Session): Promise<void> {
		await this.storage.create(context, session);
	}

	public async delete(context: SessionContext): Promise<void> {
		await this.storage.delete(context);
	}

	public async find(context: SessionContext): Promise<Session | undefined> {
		return this.storage.find(context);
	}

	public async findOrFail(context: SessionContext): Promise<Session> {
		return this.storage.findOrFail(context);
	}

	public async commit(
		context: SessionContext,
		expectedRevision: SessionRevision,
		batch: SessionEventBatch,
		state: SessionState,
	): Promise<SessionState> {
		const command = new AppendEventsCommand(context.sessionId, expectedRevision, batch);
		const result = await this.storage.append(context, command);
		const projected = this.projector.applyAll(state, result.committed);
		await this.snapshot(context, expectedRevision, result, projected);
		await this.publish(context, result);
		return projected;
	}

	public async announce(context: SessionContext, event: SessionEvent): Promise<void> {
		try {
			await this.publisher.emit(context, event);
		} catch {
			return;
		}
	}

	public async rehydrate(context: SessionContext): Promise<RehydratedSession> {
		const sessionId = context.sessionId;
		const session = await this.storage.findOrFail(context);
		const stored = await this.storage.findSnapshot(context);
		const snapshot = stored !== undefined && this.isUsable(sessionId, stored, session.revision) ? stored : undefined;

		const from = snapshot?.revision ?? SessionRevision.initial();
		let state = snapshot === undefined ? SessionState.initial() : snapshot.state.at(snapshot.revision);

		let previous = from;
		for await (const stored of this.storage.readEvents(context, from)) {
			if (!previous.precedes(stored.revision)) {
				throw new JournalCorruptedError(
					sessionId.value,
					`revision ${stored.revision.value} does not follow ${previous.value}.`,
				);
			}
			state = this.projector.apply(state, stored);
			previous = stored.revision;
		}

		return new RehydratedSession(session, state, snapshot !== undefined);
	}

	private isUsable(sessionId: SessionId, snapshot: SessionSnapshot, head: SessionRevision): boolean {
		return snapshot.isUsableAt(
			StateProjector.VERSION,
			head,
			this.checksum.of(sessionId, snapshot.projectorVersion, snapshot.state),
		);
	}

	private async snapshot(
		context: SessionContext,
		before: SessionRevision,
		result: AppendEventsResult,
		state: SessionState,
	): Promise<void> {
		if (result.isEmpty) return;
		if (!this.snapshots.shouldSnapshot(before, result.revision, state)) return;
		try {
			const sessionId = context.sessionId;
			await this.storage.saveSnapshot(
				context,
				new SessionSnapshot(
					sessionId,
					result.revision,
					StateProjector.VERSION,
					state,
					this.checksum.of(sessionId, StateProjector.VERSION, state),
				),
			);
		} catch {
			return;
		}
	}

	private async publish(context: SessionContext, result: AppendEventsResult): Promise<void> {
		if (result.isEmpty) return;
		await this.publisher.publish(context, result.committed);
	}
}
