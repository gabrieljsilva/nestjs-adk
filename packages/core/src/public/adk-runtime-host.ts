import type { IdGenerator } from "../common/identity/id-generator";
import type { Clock } from "../common/time/clock";
import type { ArtifactStorage } from "../contracts/artifact-storage";
import type { SessionStorage } from "../contracts/session-storage";
import type { DeclaredAgent } from "../domain/agent/declared-agent";
import { AgentCatalogBuilder } from "../runtime/catalog/agent-catalog-builder";
import { RuntimeFactory } from "../runtime/composition/runtime-factory";
import { RuntimeOptions } from "../runtime/composition/runtime-options";
import type { RuntimeServices } from "../runtime/composition/runtime-services";
import { HostNotStartedError } from "./errors/host-not-started.error";

/**
 * Binds the runtime to the NestJS lifecycle.
 *
 * One host per `AdkModule`, and therefore one container per module. Starting builds
 * the catalog and composes the runtime; stopping drains active runs before disposing,
 * and is safe to call twice because both the drain and the disposal are idempotent.
 */
export class AdkRuntimeHost {
	private services?: RuntimeServices;

	public constructor(private readonly factory: RuntimeFactory = new RuntimeFactory()) {}

	public async start(
		declared: readonly DeclaredAgent[],
		storage: SessionStorage,
		artifacts: ArtifactStorage,
		clock: Clock,
		ids: IdGenerator,
		options: RuntimeOptions = new RuntimeOptions(),
	): Promise<RuntimeServices> {
		const builder = new AgentCatalogBuilder();
		for (const agent of declared) builder.add(agent);

		this.services = await this.factory.create(builder.build(), storage, artifacts, clock, ids, options);
		return this.services;
	}

	public get runtime(): RuntimeServices {
		if (this.services === undefined) throw new HostNotStartedError();
		return this.services;
	}

	public get isStarted(): boolean {
		return this.services !== undefined;
	}

	/** Drain, then flush, then dispose: buffered observation leaves while the runtime still exists. */
	public async stop(): Promise<void> {
		await this.services?.lifecycle.drain();
		await this.services?.events.flush();
		await this.factory.dispose();
	}
}
