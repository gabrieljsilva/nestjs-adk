import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage.adapter";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage.adapter";
import type { IdGenerator } from "../common/identity/id-generator.contract";
import { RandomIdGenerator } from "../common/identity/random-id-generator.adapter";
import type { Clock } from "../common/time/clock.contract";
import { SystemClock } from "../common/time/system-clock.adapter";
import type { ArtifactStorage } from "../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../contracts/storage/session-storage.contract";

/**
 * What the library composes with when the application named nothing.
 *
 * There is one table and both entry points read it: `AdkModule` registers each of these
 * behind its token, and `AdkRuntime.start` fills in whatever it was not handed. Written
 * twice, the two paths drift the first time a default changes, and an application would
 * discover that the same code stores conversations in one place under NestJS and in
 * another without it.
 *
 * Every default here is in memory or in this process on purpose. They make a runtime that
 * runs, which is what a first script needs, and they lose everything when it exits, which
 * is what makes replacing them the obvious step before anything is deployed.
 */
export class RuntimeDefaults {
	/** Conversations for as long as the process lives. Replace it with `SqliteSessionStorage` or your own. */
	public static buildSessionStorage(): SessionStorage {
		return new InMemorySessionStorage();
	}

	/** The wall clock, which is what everything outside a test wants. */
	public static buildClock(): Clock {
		return new SystemClock();
	}

	/** Ids nothing collides with; a test that wants predictable ones hands its own. */
	public static buildIdGenerator(): IdGenerator {
		return new RandomIdGenerator();
	}

	/** Bytes in this process, named by the same generator the rest of the runtime names things with. */
	public static buildArtifactStorage(ids: IdGenerator): ArtifactStorage {
		return new InMemoryArtifactStorage(ids);
	}
}
