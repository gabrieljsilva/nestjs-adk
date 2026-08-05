/** Something a model may or may not be able to do. */
export class ModelCapability {
	public static readonly TOOLS = new ModelCapability("tools");
	public static readonly STRUCTURED_OUTPUT = new ModelCapability("structured-output");
	public static readonly STREAMING = new ModelCapability("streaming");
	public static readonly PROMPT_CACHE = new ModelCapability("prompt-cache");
	public static readonly MEDIA_INPUT = new ModelCapability("media-input");

	/** The provider counts tokens before a call. Most do not, and none of them may pretend to. */
	public static readonly TOKEN_COUNTING = new ModelCapability("token-counting");

	private constructor(public readonly name: string) {}

	public equals(other: ModelCapability): boolean {
		return this.name === other.name;
	}

	public toString(): string {
		return this.name;
	}
}
