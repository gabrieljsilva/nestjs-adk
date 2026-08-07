---
title: Session snapshots
description: Why a snapshot is always disposable, when the runtime writes one, and what invalidates every snapshot at once
type: pattern
tags: [core, sessions, persistence, journal]
---

A session's state is a fold of its journal, so it can always be rebuilt from revision 0. A snapshot is a shortcut to a fold that already happened, and nothing more than that. Everything about how it is written and read follows from being disposable.

## Reading never depends on one

`SessionManager.rehydrate` prefers a snapshot and never needs it. A snapshot written by another projector version, one whose checksum does not match its state, or one sitting past the session head, is ignored and the journal is replayed whole. The suspicious snapshot is left where it is rather than deleted: it is evidence, and deleting it would lose the only trace of whatever wrote it.

That is why `SessionSnapshot` carries `projectorVersion` and a `checksum`. Without them a stale snapshot loads silently and the session means something it never meant.

## Writing never fails a run

Writing happens inside `SessionManager.commit`, after the append is confirmed and before the publisher is told anything. A storage that refuses the write is swallowed: the journal is already durable, so the cost is a replay later and nothing else. Turning it into a thrown error would end a run that actually succeeded, which trades a correct outcome for an optimization.

For the same reason an empty batch writes nothing. There is no new state to shortcut to.

## Two triggers, both readable from the commit itself

`SnapshotPolicy.shouldSnapshot(before, after, state)` answers from what a commit already has in hand:

- a turn waiting for approval always writes one, because the wait has no bound and the process that answers it may never be this one;
- otherwise, crossing a multiple of the threshold writes one.

The count comes from the revision rather than from the distance to the last snapshot, and that is deliberate: a commit does not know where the last snapshot landed, and asking storage would add a read to every commit to serve an optimization. Crossing a bucket costs at most one skipped snapshot when a write fails, instead of a drift that never recovers.

## Changing the projector invalidates every snapshot

`StateProjector.VERSION` is part of the checksum. Adding an event to the projection, or changing what an existing one folds into, means bumping it, and every snapshot ever written stops being usable at that moment.

That is the intended behavior, not a cost to avoid. The fallback is a full replay, which is what a session without a snapshot does anyway. What must never happen is a projector change landing without the version bump, because then old snapshots load into a shape that no longer means the same thing.

## The trap this came from

The read path was written first and lived a long time with no writer at all: `saveSnapshot` existed on the contract and on the adapter, `rehydrate` read snapshots, and the only thing producing one was a test. Every rehydration replayed the whole journal, and nothing failed, because a missing snapshot is indistinguishable from an optimization that decided not to fire.

A read path fed only by test fixtures is not tested integration. When both halves exist, every test that commits and rehydrates exercises the round trip for free.

Related: [[context-projection]], [[tool-approval]], [[storage-adapters]].
