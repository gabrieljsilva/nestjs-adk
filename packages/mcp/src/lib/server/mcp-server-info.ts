/** How the server introduces itself in the initialize handshake. */
export class McpServerInfo {
	private constructor(
		public readonly name: string,
		public readonly version: string,
	) {
		Object.freeze(this);
	}

	public static of(name: string, version: string): McpServerInfo {
		return new McpServerInfo(name.trim(), version.trim());
	}
}
