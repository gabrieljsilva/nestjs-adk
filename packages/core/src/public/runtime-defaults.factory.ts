import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage.adapter";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage.adapter";
import type { IdGenerator } from "../common/identity/id-generator.contract";
import { RandomIdGenerator } from "../common/identity/random-id-generator.adapter";
import type { Clock } from "../common/time/clock.contract";
import { SystemClock } from "../common/time/system-clock.adapter";
import type { ArtifactStorage } from "../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../contracts/storage/session-storage.contract";

/**
 * What the library composes with when the application named nothing, read by `AdkModule` and
 * by `AdkRuntime.start` alike so both entry points pick the same ones.
 *
 * Every default is in this process and loses everything when it exits, which is what makes
 * replacing them the step before anything is deployed.
 */
export class RuntimeDefaults {
	public static buildSessionStorage(): SessionStorage {
		return new InMemorySessionStorage();
	}

	public static buildClock(): Clock {
		return new SystemClock();
	}

	public static buildIdGenerator(): IdGenerator {
		return new RandomIdGenerator();
	}

	public static buildArtifactStorage(ids: IdGenerator): ArtifactStorage {
		return new InMemoryArtifactStorage(ids);
	}
}
