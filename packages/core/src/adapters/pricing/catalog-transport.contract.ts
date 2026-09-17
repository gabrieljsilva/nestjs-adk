export abstract class CatalogTransport {
	public abstract read(): Promise<unknown>;
}
