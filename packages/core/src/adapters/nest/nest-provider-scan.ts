import { UnusableComponentError } from "./errors/unusable-component.error";
import { AGENT_METADATA, TOOL_METADATA } from "./metadata-keys";
import { ScannedProvider } from "./scanned-provider";

/**
 * One provider of the container, as this reads it.
 *
 * Declared as the four things it uses rather than as NestJS's own wrapper: the scan is a
 * rule about what a component has to be, and a rule that can only be tested by building a
 * container is a rule nobody tests.
 */
export interface ContainerProvider {
	readonly name: unknown;
	readonly metatype: unknown;
	readonly instance: unknown;
	isDependencyTreeStatic(): boolean;
}

/**
 * The container as a list of components the runtime can compose from.
 *
 * It runs when NestJS has finished building every static provider, so an instance it reads
 * is the definitive one. That timing is the whole point: NestJS creates a prototype for
 * each provider first and only later constructs the real object, replacing what was there,
 * so anything captured earlier is a shell that never receives its dependencies.
 *
 * Only classes that declared something are kept. Everything else in the container is an
 * ordinary provider that has nothing to do with a run.
 */
export class NestProviderScan {
	public read(providers: readonly ContainerProvider[]): ScannedProvider[] {
		const scanned: ScannedProvider[] = [];
		for (const provider of providers) {
			const type = provider.metatype;
			if (typeof type !== "function" || !NestProviderScan.declaresComponent(type)) continue;
			scanned.push(new ScannedProvider(String(provider.name), type, NestProviderScan.instanceOf(provider)));
		}
		return scanned;
	}

	private static instanceOf(provider: ContainerProvider): object {
		const name = String(provider.name);
		if (!provider.isDependencyTreeStatic()) {
			throw new UnusableComponentError(
				name,
				"it is request or transient scoped, and an agent or a tool is composed once for the whole application.",
			);
		}
		const instance = provider.instance;
		if (typeof instance !== "object" || instance === null) {
			throw new UnusableComponentError(name, "NestJS has no instance for it at the moment the runtime composes.");
		}
		return instance;
	}

	private static declaresComponent(type: object): boolean {
		return (
			Reflect.getMetadata(AGENT_METADATA, type) !== undefined || Reflect.getMetadata(TOOL_METADATA, type) !== undefined
		);
	}
}
