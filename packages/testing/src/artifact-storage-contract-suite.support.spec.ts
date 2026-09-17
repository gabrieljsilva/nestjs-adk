import {
	ArtifactContent,
	type ArtifactStorage,
	InMemoryArtifactStorage,
	RandomIdGenerator,
	SessionContext,
	SessionId,
	SqliteArtifactStorage,
} from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ArtifactStorageContractSuite } from "./artifact-storage-contract-suite.support";

/** A store that hands back whatever it holds, whichever session asked. */
class UnscopedArtifactStorage extends InMemoryArtifactStorage {
	public override async find(context: SessionContext, artifactId: Parameters<InMemoryArtifactStorage["find"]>[1]) {
		const mine = await super.find(context, artifactId);
		if (mine !== undefined) return mine;
		return super.find(SessionContext.fromSessionId(SessionId.from("s-1")), artifactId);
	}
}

/** A store that answers every read with whatever was written last, checking no digest. */
class ForgetfulArtifactStorage extends InMemoryArtifactStorage {
	private latest?: ArtifactContent;

	public override async put(context: SessionContext, content: ArtifactContent) {
		this.latest = content;
		return super.put(context, content);
	}

	public override async read(): Promise<ArtifactContent> {
		return this.latest ?? new ArtifactContent("nothing was ever written");
	}
}

const suite = new ArtifactStorageContractSuite();

/** Names of the cases the adapter did not survive, which is the whole output of a meta test. */
async function failingCases(create: () => ArtifactStorage): Promise<string[]> {
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
 * Both artifact stores the library ships, measured here rather than each in its own package.
 *
 * The contract is one thing, so it runs in one place, against everything that claims to
 * satisfy it. A copy of this loop living next to each adapter is how two adapters end up
 * being held to two slightly different contracts.
 */
describe.each([
	["InMemoryArtifactStorage", () => new InMemoryArtifactStorage(new RandomIdGenerator())],
	["SqliteArtifactStorage", () => new SqliteArtifactStorage()],
] as const)("ArtifactStorage contract, against %s", (_name, create) => {
	for (const contractCase of suite.cases(create)) {
		it(contractCase.name, async () => {
			await contractCase.run();
		});
	}
});

describe("ArtifactStorageContractSuite", () => {
	it("names the port it measures", () => {
		expect(suite.port).toBe("ArtifactStorage");
	});

	it("catches a store that lets one session read another's", async () => {
		expect(await failingCases(() => new UnscopedArtifactStorage(new RandomIdGenerator()))).not.toEqual([]);
	});

	it("catches a store that answers with content the reference does not describe", async () => {
		expect(await failingCases(() => new ForgetfulArtifactStorage(new RandomIdGenerator()))).not.toEqual([]);
	});
});
