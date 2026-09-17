import type { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { AppendEventsCommand } from "../../contracts/storage/append-events-command";
import type { AppendEventsResult } from "../../contracts/storage/append-events-result";
import type { SessionStorage } from "../../contracts/storage/session-storage";
import type { SessionEvent } from "../../domain/event/session-event";
import type { SessionEventBatch } from "../../domain/event/session-event-batch";
import { SessionContext } from "../../domain/run/session-context";
import { JournalCorruptedError } from "../../domain/session/errors/journal-corrupted.error";
import type { Session } from "../../domain/session/session";
import { SessionSnapshot } from "../../domain/session/state/session-snapshot";
import { SessionState } from "../../domain/session/state/session-state";
import type { SessionEventPublisher } from "../event/session-event-publisher";
import { NoOpSessionEventPublisher } from "./no-op-session-event-publisher";
import { RehydratedSession } from "./rehydrated-session";
import { RevisionBucketSnapshotPolicy } from "./snapshot/revision-bucket-snapshot-policy";
import type { SnapshotPolicy } from "./snapshot/snapshot-policy";
import { StateChecksum } from "./snapshot/state-checksum";
import { StateProjector } from "./state-projector";

/**
 * The single door between a run and the durability of its session.
 *
 * Commit is the whole contract in one place: the storage appends atomically, only the
 * envelopes it confirmed are projected into state, and observers are told afterwards.
 * A publisher that throws does not undo a journal that is already committed.
 *
 * Rehydration prefers a snapshot but never depends on one. Anything wrong with it,
 * a foreign projector, a broken checksum, a revision beyond the head, falls back to a
 * full replay, and the snapshot is left alone rather than deleted. Writing one is the
 * mirror of that: it happens after the journal is already durable and never speaks up
 * when it fails, because a run must not end differently over a lost shortcut.
 */
export class SessionManager {
	public constructor(
		private readonly storage: SessionStorage,
		private readonly projector: StateProjector = new StateProjector(),
		private readonly publisher: SessionEventPublisher = new NoOpSessionEventPublisher(),
		private readonly checksum: StateChecksum = new StateChecksum(),
		private readonly snapshots: SnapshotPolicy = RevisionBucketSnapshotPolicy.everyFiftyEvents(),
	) {}

	/** A session exists before its first event, so the head is written on its own. */
	public async create(context: SessionContext, session: Session): Promise<void> {
		await this.storage.create(context, session);
	}

	/**
	 * The head of a conversation, without the journal behind it.
	 *
	 * This is the cheap read, and it is deliberately not `rehydrate`: answering whether a
	 * chat already has a conversation, or who owns it, is one row, while rehydrating replays
	 * every event to project a state the caller never asked for.
	 */
	/** The journal of one conversation, gone. Nothing here decides whether it should be. */
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

	/**
	 * Tells the observers something the journal would not take.
	 * It is the last resort of a run that ended and could not record it: the fact reaches
	 * whoever is watching without ever claiming to be durable.
	 */
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

	/**
	 * Writes the shortcut the next rehydration would rather read than rebuild.
	 *
	 * It is deliberately silent about failing. The journal is already committed at this
	 * point, so a storage that refuses the snapshot costs a replay later and nothing else,
	 * and turning that into a thrown error would end a run that actually succeeded.
	 */
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

	/** Observation lives outside the transaction, so its failure never rewrites history. */
	private async publish(context: SessionContext, result: AppendEventsResult): Promise<void> {
		if (result.isEmpty) return;
		await this.publisher.publish(context, result.committed);
	}
}
