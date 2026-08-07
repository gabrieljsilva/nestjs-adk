/**
 * How a price catalog is read.
 *
 * It exists so that the source can be tested without the network. The default reads the file
 * LiteLLM publishes over HTTP, and a consumer that keeps a vendored copy, sits behind a proxy or
 * needs its own headers replaces this and keeps everything else.
 *
 * It answers `unknown` on purpose: what arrives from outside is not typed until something has
 * checked it, and checking it is the projection's job.
 */
export abstract class CatalogTransport {
	public abstract read(): Promise<unknown>;
}
