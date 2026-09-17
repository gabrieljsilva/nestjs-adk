import type { InjectionToken, ModuleMetadata, OptionalFactoryDependency, Type } from "@nestjs/common";
import type { AdkModuleOptions } from "./adk-module.options";

/**
 * Builds the module's options out of what the container can inject.
 *
 * This is the typed half of `forRootAsync`, and the reason to prefer it. A factory declares
 * its dependencies in an `inject` array that TypeScript cannot line up with its parameters,
 * so two entries swapped compile and fail at boot; a class declares them in its constructor,
 * which NestJS resolves and TypeScript checks like any other provider.
 *
 * ```ts
 * @Injectable()
 * export class AdkOptions implements AdkOptionsFactory {
 *   public constructor(
 *     private readonly storage: PrismaSessionStorage,
 *     private readonly pricing: LiteLlmPricingSource,
 *   ) {}
 *
 *   public createAdkOptions(): AdkModuleOptions {
 *     return AdkModuleOptions.from({
 *       defaultModel: this.model,
 *       storage: this.storage,
 *       runtime: RuntimeOptions.from({ cost: { pricing: this.pricing } }),
 *     });
 *   }
 * }
 * ```
 */
export interface AdkOptionsFactory {
	createAdkOptions(): AdkModuleOptions | Promise<AdkModuleOptions>;
}

/**
 * How `AdkModule.forRootAsync` is told where the options come from.
 *
 * Exactly one of `useFactory`, `useClass` and `useExisting` says it, and declaring two is
 * refused: the second would be configuration nothing reads. `imports` is what makes the
 * dependencies reachable, and it is visible only to the module's own providers.
 *
 * `useClass` is registered as a provider by the module, so the class itself does not have
 * to be declared anywhere; its dependencies still have to be reachable through `imports`.
 * `useExisting` reuses an instance another module already provides and exports, which is
 * the difference between the two: one is constructed here, the other is borrowed.
 */
export interface AdkModuleAsyncOptions extends Pick<ModuleMetadata, "imports"> {
	/**
	 * Annotate the parameters. They are typed `never` rather than `any`, which is what lets a
	 * factory of any shape be accepted at all, and it means an unannotated parameter carries
	 * no type into the body. `useClass` is the form that does not have this problem.
	 */
	useFactory?: (...args: never[]) => AdkModuleOptions | Promise<AdkModuleOptions>;
	/** What the container resolves and hands to `useFactory`, in the order it declares them. */
	inject?: readonly (InjectionToken | OptionalFactoryDependency)[];
	useClass?: Type<AdkOptionsFactory>;
	useExisting?: Type<AdkOptionsFactory>;
}
