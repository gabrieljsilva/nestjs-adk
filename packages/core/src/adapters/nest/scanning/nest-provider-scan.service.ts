import { UnusableComponentError } from "../errors/unusable-component.error";
import { AGENT_METADATA, MCP_CONTROLLER_METADATA, TOOL_METADATA } from "../metadata/metadata-keys.token";
import { ScannedProvider } from "./scanned-provider.value-object";

export interface ContainerProvider {
	readonly name: unknown;
	readonly token: unknown;
	readonly metatype: unknown;
	readonly instance: unknown;
	isDependencyTreeStatic(): boolean;
}

export class NestProviderScan {
	public read(providers: readonly ContainerProvider[]): ScannedProvider[] {
		const scanned: ScannedProvider[] = [];
		for (const provider of providers) {
			const carrier = NestProviderScan.readCarrier(provider);
			if (carrier === undefined) continue;
			scanned.push(new ScannedProvider(String(provider.name), carrier, NestProviderScan.readInstance(provider)));
		}
		return scanned;
	}

	private static readCarrier(provider: ContainerProvider): object | undefined {
		for (const candidate of [provider.token, provider.metatype]) {
			if (typeof candidate === "function" && NestProviderScan.declaresComponent(candidate)) return candidate;
		}
		return undefined;
	}

	private static readInstance(provider: ContainerProvider): object {
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
			Reflect.getMetadata(AGENT_METADATA, type) !== undefined ||
			Reflect.getMetadata(TOOL_METADATA, type) !== undefined ||
			Reflect.getMetadata(MCP_CONTROLLER_METADATA, type) !== undefined
		);
	}
}
