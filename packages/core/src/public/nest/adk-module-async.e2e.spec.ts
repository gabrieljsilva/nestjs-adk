import "reflect-metadata";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { SessionStorage } from "../../contracts/storage/session-storage";
import type { SessionContext } from "../../domain/run/session-context";
import type { Session } from "../../domain/session/session";
import { RecordingModel } from "../../support/nest/recording-model.fixture";
import { AgentRegistry } from "./agent/agent-registry";
import { Agent } from "./decorators/agent.decorator";
import { AdkModule } from "./module/adk-module";
import type { AdkModuleAsyncOptions, AdkOptionsFactory } from "./module/adk-module-async-options";
import { AdkModuleOptions } from "./module/adk-module-options";

/** Stands in for the client a real adapter holds, and the reason a storage cannot be a value. */
@Injectable()
class Vault {
	public readonly prefix = "sealed";
}

/**
 * A storage that only exists once the container has built it.
 *
 * This is the whole case for `forRootAsync`: nothing that runs while `app.module.ts` is
 * being read can name this instance, because the dependency it needs does not exist yet.
 */
@Injectable()
class VaultSessionStorage extends InMemorySessionStorage {
	public readonly created: string[] = [];

	public constructor(private readonly vault: Vault) {
		super();
	}

	public override async create(context: SessionContext, session: Session): Promise<void> {
		this.created.push(`${this.vault.prefix}:${session.id.value}`);
		await super.create(context, session);
	}
}

@Injectable()
class VaultOptions implements AdkOptionsFactory {
	/** Proves `useExisting` borrows rather than constructing a second one. */
	public static built = 0;

	public constructor(private readonly storage: VaultSessionStorage) {
		VaultOptions.built += 1;
	}

	public createAdkOptions(): AdkModuleOptions {
		return AdkModuleOptions.from({ defaultModel: new RecordingModel("hello there"), storage: this.storage });
	}
}

@Module({ providers: [Vault, VaultSessionStorage], exports: [VaultSessionStorage] })
class InfraModule {}

@Module({ imports: [InfraModule], providers: [VaultOptions], exports: [VaultOptions] })
class OptionsModule {}

@Agent({ name: "support", description: "Handles orders.", prompt: "Be brief." })
class SupportAgent {}

@Module({ providers: [SupportAgent] })
class FeatureModule {}

describe("AdkModule.forRootAsync", () => {
	let app: TestingModule;

	beforeEach(() => {
		VaultOptions.built = 0;
	});

	afterEach(async () => {
		await app?.close();
	});

	async function bootWith(declared: AdkModuleAsyncOptions): Promise<TestingModule> {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRootAsync(declared), FeatureModule],
		}).compile();
		await app.init();
		return app;
	}

	it("composes on a storage the container built, which no value could have named", async () => {
		const booted = await bootWith({
			imports: [InfraModule],
			inject: [VaultSessionStorage],
			useFactory: (storage: VaultSessionStorage) =>
				AdkModuleOptions.from({ defaultModel: new RecordingModel("hello there"), storage }),
		});

		const result = await booted.get(AgentRegistry).get("support").ask("hi");

		const storage = booted.get(VaultSessionStorage);
		expect(booted.get(SessionStorage)).toBe(storage);
		expect(storage.created).toEqual([`sealed:${result.sessionId}`]);
	});

	it("takes the options from a class whose dependencies NestJS resolved", async () => {
		const booted = await bootWith({ imports: [InfraModule], useClass: VaultOptions });

		const result = await booted.get(AgentRegistry).get("support").ask("hi");

		expect(booted.get(VaultSessionStorage).created).toEqual([`sealed:${result.sessionId}`]);
	});

	it("registers the class of useClass itself, so the application declared it nowhere", async () => {
		const booted = await bootWith({ imports: [InfraModule], useClass: VaultOptions });

		expect(booted.get(VaultOptions)).toBeInstanceOf(VaultOptions);
		expect(VaultOptions.built).toBe(1);
	});

	it("borrows the instance another module already provides, instead of building a second", async () => {
		const booted = await bootWith({ imports: [OptionsModule], useExisting: VaultOptions });

		await booted.get(AgentRegistry).get("support").ask("hi");

		expect(VaultOptions.built).toBe(1);
		expect(booted.get(SessionStorage)).toBe(booted.get(VaultSessionStorage));
	});

	it("waits for a factory that resolves later, since a client is usually connected first", async () => {
		const booted = await bootWith({
			imports: [InfraModule],
			inject: [VaultSessionStorage],
			useFactory: async (storage: VaultSessionStorage) => {
				await Promise.resolve();
				return AdkModuleOptions.from({ defaultModel: new RecordingModel("hello there"), storage });
			},
		});

		const result = await booted.get(AgentRegistry).get("support").ask("hi");

		expect(result.text).toBe("hello there");
		expect(booted.get(VaultSessionStorage).created).toHaveLength(1);
	});

	it("still discovers the agents, which is what its own import is there for", async () => {
		const booted = await bootWith({ imports: [InfraModule], useClass: VaultOptions });

		expect(booted.get(AgentRegistry).names).toEqual(["support"]);
	});
});
