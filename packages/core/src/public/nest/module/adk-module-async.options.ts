import type { InjectionToken, ModuleMetadata, OptionalFactoryDependency, Type } from "@nestjs/common";
import type { AdkModuleOptions, AdkModuleOptionsInput } from "./adk-module.options";

/**
 * Builds the module's options out of what the container can inject, for `forRootAsync`. Prefer
 * it over `useFactory`: the dependencies are constructor parameters NestJS resolves and
 * TypeScript checks, instead of an `inject` array nothing lines up with.
 */
export interface AdkOptionsFactory {
	createAdkOptions(): AdkModuleOptions | AdkModuleOptionsInput | Promise<AdkModuleOptions | AdkModuleOptionsInput>;
}

/**
 * How `AdkModule.forRootAsync` is told where the options come from. Exactly one of
 * `useFactory`, `useClass` and `useExisting` says it, and declaring two is refused.
 *
 * `useClass` is registered as a provider here, `useExisting` borrows one another module
 * exports. Either way the dependencies have to be reachable through `imports`.
 */
export interface AdkModuleAsyncOptions extends Pick<ModuleMetadata, "imports"> {
	useFactory?: (
		...args: never[]
	) => AdkModuleOptions | AdkModuleOptionsInput | Promise<AdkModuleOptions | AdkModuleOptionsInput>;
	inject?: readonly (InjectionToken | OptionalFactoryDependency)[];
	useClass?: Type<AdkOptionsFactory>;
	useExisting?: Type<AdkOptionsFactory>;
}
