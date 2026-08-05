/**
 * Directories the guard walks.
 * The playground is included on purpose: the characterization suite lives there and
 * must answer to the same rules as the packages.
 */
export class ScanRoots {
	private constructor(public readonly values: readonly string[]) {}

	public static default(): ScanRoots {
		return new ScanRoots([
			"packages/core/src",
			"packages/google/src",
			"packages/mcp/src",
			"packages/testing/src",
			"apps/playground/src",
		]);
	}

	public static of(values: readonly string[]): ScanRoots {
		return new ScanRoots([...values]);
	}
}
