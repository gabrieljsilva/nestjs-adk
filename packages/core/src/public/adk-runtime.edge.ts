import type { IdGenerator } from "../common/identity/id-generator.contract";
import type { Clock } from "../common/time/clock.contract";
import type { ArtifactStorage } from "../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../contracts/storage/session-storage.contract";
import type { DeclaredAgent } from "../domain/agent/declared-agent.value-object";
import type { ToolDefinition } from "../domain/tool/tool-definition.value-object";
import { AgentCatalogBuilder } from "../runtime/catalog/agent-catalog-builder.factory";
import type { RuntimeServices } from "../runtime/composition/runtime-services.value-object";
import { RuntimeFactory } from "../runtime/composition/runtime.factory";
import { RuntimeOptions } from "../runtime/composition/runtime.options";
import { HostNotStartedError } from "./errors/host-not-started.error";

/**
 * Where a composed runtime is read from, whenever it exists.
 *
 * Anything built while the container is still being wired holds this rather than the
 * services themselves: the runtime is composed on module init, so a collaborator created
 * before that has to ask later instead of being handed something that does not exist yet.
 */
export interface StartedRuntime {
	readonly runtime: RuntimeServices;
}

/**
 * Binds the runtime to the NestJS lifecycle.
 *
 * One host per `AdkModule`, and therefore one container per module. Starting builds
 * the catalog and composes the runtime; stopping drains active runs before disposing,
 * and is safe to call twice because both the drain and the disposal are idempotent.
 */
export class AdkRuntime implements StartedRuntime {
	private services?: RuntimeServices;

	public constructor(private readonly factory: RuntimeFactory = new RuntimeFactory()) {}

	public async start(
		declared: readonly DeclaredAgent[],
		storage: SessionStorage,
		artifacts: ArtifactStorage,
		clock: Clock,
		ids: IdGenerator,
		options: RuntimeOptions = new RuntimeOptions(),
		exposed: readonly ToolDefinition[] = [],
	): Promise<RuntimeServices> {
		const builder = new AgentCatalogBuilder();
		for (const agent of declared) builder.add(agent);

		this.services = await this.factory.create(builder.build(), storage, artifacts, clock, ids, options, exposed);
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
