/** How the server introduces itself in the initialize handshake. */
export class McpServerInfo {
	public readonly name: string;
	public readonly version: string;

	public constructor(name: string, version: string) {
		this.name = name.trim();
		this.version = version.trim();
		Object.freeze(this);
	}
}
