import "reflect-metadata";
import { Injectable, Module } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ScriptedModel } from "../../../support/run/scripted-model.fixture";
import { AsyncOptionsNotDeclaredError } from "../errors/async-options-not-declared.error";
import { ConflictingAsyncOptionsError } from "../errors/conflicting-async-options.error";
import type { AdkOptionsFactory } from "./adk-module-async.options";
import { AdkModuleOptions } from "./adk-module.options";
import { ADK_OPTIONS, AdkModule } from "./adk.module";

@Injectable()
class BuiltOptions implements AdkOptionsFactory {
	public createAdkOptions(): AdkModuleOptions {
		return new AdkModuleOptions({
			defaultModel: new ScriptedModel("primary"),
		});
	}
}

@Module({ providers: [BuiltOptions], exports: [BuiltOptions] })
class OptionsModule {}

/** The one provider both entry points disagree about; everything else reads it. */
function optionsProviderOf(providers: unknown[] | undefined): unknown {
	return providers?.find(
		(provider) => typeof provider === "object" && Reflect.get(Object(provider), "provide") === ADK_OPTIONS,
	);
}

describe("AdkModule", () => {
	it("is a global module, so an application injects the runtime without importing it again", () => {
		const dynamic = AdkModule.forRoot(
			new AdkModuleOptions({
				defaultModel: new ScriptedModel("primary"),
			}),
		);

		expect(dynamic.module).toBe(AdkModule);
	});

	it("exports what an application actually holds", () => {
		const dynamic = AdkModule.forRoot(
			new AdkModuleOptions({
				defaultModel: new ScriptedModel("primary"),
			}),
		);

		expect(dynamic.exports?.length).toBeGreaterThan(0);
	});

	it("keeps the options reachable under a token of their own", () => {
		const options = new AdkModuleOptions({
			defaultModel: new ScriptedModel("primary"),
		});
		const dynamic = AdkModule.forRoot(options);

		const provided = optionsProviderOf(dynamic.providers);
		expect(Reflect.get(Object(provided), "useValue")).toBe(options);
	});

	describe("forRootAsync", () => {
		it("builds the same module, so nothing downstream can tell how the options arrived", () => {
			const sync = AdkModule.forRoot(
				new AdkModuleOptions({
					defaultModel: new ScriptedModel("primary"),
				}),
			);
			const async = AdkModule.forRootAsync({ imports: [OptionsModule], useClass: BuiltOptions });

			expect(async.module).toBe(AdkModule);
			expect(async.exports).toEqual(sync.exports);
			expect(async.providers?.length).toBe((sync.providers?.length ?? 0) + 1);
		});

		it("resolves the options through the factory's own dependencies", () => {
			const dynamic = AdkModule.forRootAsync({
				imports: [OptionsModule],
				inject: [BuiltOptions],
				useFactory: (built: BuiltOptions) => built.createAdkOptions(),
			});

			const provided = Object(optionsProviderOf(dynamic.providers));
			expect(Reflect.get(provided, "inject")).toEqual([BuiltOptions]);
			expect(typeof Reflect.get(provided, "useFactory")).toBe("function");
		});

		it("defaults the factory's dependencies to none rather than to undefined", () => {
			const dynamic = AdkModule.forRootAsync({
				useFactory: () =>
					new AdkModuleOptions({
						defaultModel: new ScriptedModel("primary"),
					}),
			});

			expect(Reflect.get(Object(optionsProviderOf(dynamic.providers)), "inject")).toEqual([]);
		});

		it("registers the class it was told to build, so an application declares it nowhere", () => {
			const dynamic = AdkModule.forRootAsync({ useClass: BuiltOptions });

			expect(dynamic.providers).toContain(BuiltOptions);
			expect(Reflect.get(Object(optionsProviderOf(dynamic.providers)), "inject")).toEqual([BuiltOptions]);
		});

		it("borrows the instance for useExisting instead of constructing a second one", () => {
			const dynamic = AdkModule.forRootAsync({ imports: [OptionsModule], useExisting: BuiltOptions });

			expect(dynamic.providers).not.toContain(BuiltOptions);
			expect(Reflect.get(Object(optionsProviderOf(dynamic.providers)), "inject")).toEqual([BuiltOptions]);
		});

		it("keeps its own imports, since discovery is what finds the agents", () => {
			const dynamic = AdkModule.forRootAsync({ imports: [OptionsModule], useClass: BuiltOptions });

			expect(dynamic.imports).toContain(OptionsModule);
			expect(dynamic.imports?.length).toBe(2);
		});

		it("refuses a call that never says where the options come from", () => {
			expect(() => AdkModule.forRootAsync({ imports: [OptionsModule] })).toThrow(AsyncOptionsNotDeclaredError);
		});

		it("refuses two forms, because one of them would be configuration nothing reads", () => {
			expect(() =>
				AdkModule.forRootAsync({
					useClass: BuiltOptions,
					useFactory: () =>
						new AdkModuleOptions({
							defaultModel: new ScriptedModel("primary"),
						}),
				}),
			).toThrow(ConflictingAsyncOptionsError);
		});
	});
});
