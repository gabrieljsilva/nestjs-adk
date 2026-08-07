import {
	InMemorySessionStorage,
	type SessionStorage,
	SqliteSessionStorage,
	StorageCapabilities,
} from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { NoOccSessionStorage } from "./faulty/no-occ-session-storage";
import { NonAtomicSessionStorage } from "./faulty/non-atomic-session-storage";
import { NonContiguousSessionStorage } from "./faulty/non-contiguous-session-storage";
import { NonIdempotentSessionStorage } from "./faulty/non-idempotent-session-storage";
import { SessionStorageContractSuite } from "./session-storage-contract-suite";

/** A storage as strong as the reference one, only honest about promising less. */
class EphemeralSessionStorage extends InMemorySessionStorage {
	public override capabilities(): StorageCapabilities {
		return StorageCapabilities.ephemeral();
	}
}

/** A deliberately broken adapter, and the guarantee its defect gives up. */
class FaultyAdapter {
	public constructor(
		public readonly name: string,
		public readonly defect: string,
		public readonly create: () => SessionStorage,
	) {}
}

const suite = new SessionStorageContractSuite();

const FAULTY = [
	new FaultyAdapter(
		"NoOccSessionStorage",
		"it ignores expectedRevision while declaring durable capabilities",
		() => new NoOccSessionStorage(),
	),
	new FaultyAdapter(
		"NonIdempotentSessionStorage",
		"it writes a retried batch again instead of answering with the committed one",
		() => new NonIdempotentSessionStorage(),
	),
	new FaultyAdapter(
		"NonContiguousSessionStorage",
		"it advances revisions two at a time and leaves holes in the journal",
		() => new NonContiguousSessionStorage(),
	),
	new FaultyAdapter(
		"NonAtomicSessionStorage",
		"it persists only the first event of a multi event batch",
		() => new NonAtomicSessionStorage(),
	),
];

/** Names of the cases the adapter did not survive, which is the whole output of a meta test. */
async function failingCases(create: () => SessionStorage): Promise<string[]> {
	const failures: string[] = [];
	for (const contractCase of suite.cases(create)) {
		try {
			await contractCase.run();
		} catch {
			failures.push(contractCase.name);
		}
	}
	return failures;
}

/**
 * Both adapters the library ships, measured here rather than each in its own package.
 *
 * The contract is one thing, so it runs in one place, against everything that claims to
 * satisfy it. A copy of this loop living next to each adapter is how two adapters end up
 * being held to two slightly different contracts.
 */
describe.each([
	["InMemorySessionStorage", () => new InMemorySessionStorage()],
	["SqliteSessionStorage", () => new SqliteSessionStorage()],
] as const)("SessionStorage contract, against %s", (_name, create) => {
	for (const contractCase of suite.cases(create)) {
		it(contractCase.name, async () => {
			await contractCase.run();
		});
	}
});

describe("SessionStorageContractSuite", () => {
	it("holds an ephemeral storage only to what it promised", () => {
		const durable = suite.cases(() => new InMemorySessionStorage()).map((contractCase) => contractCase.name);
		const ephemeral = suite.cases(() => new EphemeralSessionStorage()).map((contractCase) => contractCase.name);

		expect(ephemeral.length).toBeLessThan(durable.length);
		expect(durable).toEqual(expect.arrayContaining(ephemeral));
	});

	it("runs every case of an ephemeral storage that is stronger than its own promise", async () => {
		expect(await failingCases(() => new EphemeralSessionStorage())).toEqual([]);
	});

	for (const adapter of FAULTY) {
		it(`catches ${adapter.name}`, async () => {
			const failures = await failingCases(adapter.create);

			expect(
				failures.length,
				`${adapter.name} passed every contract case, so the suite no longer detects that ${adapter.defect}. Add or tighten a case until this defect fails.`,
			).toBeGreaterThan(0);
		});
	}
});
