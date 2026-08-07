# @nestjs-adk/core

**Build AI agents the NestJS way.**

NestJS developers already know how to build good software: classes, modules, providers and dependency injection. nestjs-adk brings AI agents into that same world. An agent is a class with a decorator. A tool is a provider. Everything is injected, validated and tested like the rest of your app.

This package is the framework: the decorators, the module, the run loop and every contract. To talk to a real model you also install a provider package:

```bash
npm i @nestjs-adk/core @nestjs-adk/google
```

## Your first agent

Register the module once, in your root module. This is where the default model lives:

```ts
import { AdkModule, AdkModuleOptions } from "@nestjs-adk/core";
import { GeminiModel } from "@nestjs-adk/google";

const flash = new GeminiModel("gemini-3.5-flash-lite", { apiKey: process.env.GEMINI_API_KEY });

@Module({
	imports: [AdkModule.forRoot(AdkModuleOptions.from({ defaultModel: flash }))],
	providers: [SupportAgent, LookupOrderTool, OrdersService, ChatService],
})
export class AppModule {}
```

Now the agent. It is a class described by `@Agent`, and extending `AdkAgent` is what lets you inject it and ask it something:

```ts
import { AdkAgent, Agent } from "@nestjs-adk/core";

@Agent({
	name: "support",
	description: "Customer support: order status and returns.",
	prompt: "You are the store's support agent. Answer in at most two sentences.",
	tools: [LookupOrderTool],
})
export class SupportAgent extends AdkAgent {}
```

The agent went into `providers` like any other class. There is no separate registration step, and a mistake in the wiring fails at boot naming the provider rather than surfacing on a request: a tool nobody registered, a transfer target that is not an agent, a provider the container cannot hand a single instance of.

To use it, inject it. The instance is the handle:

```ts
@Injectable()
export class ChatService {
	public constructor(private readonly support: SupportAgent) {}

	public async answer(sessionId: string, message: string): Promise<string> {
		const result = await this.support.ask(message, { sessionId });
		return result.text;
	}
}
```

`ask` returns an `AgentResult`: the text, the session and run ids, the status, anything waiting for a human, and what the run cost. `stream` runs the same thing and yields the pieces as they arrive. `approve` and `reject` answer a run that stopped in front of a person, and `delegate` hands one task to a specialist.

An agent that already extends something else is reached by name instead:

```ts
const support = this.registry.get("support"); // AgentRegistry, injected
```

That is the whole mental model: configure the module once, register classes as providers, inject the agent and call it.

## Tools

A tool is something the model can decide to call. A shared tool is a class that extends `AdkTool`. The Zod schema does two jobs at once: it tells the model what arguments exist, and it types the input for you.

```ts
import { AdkTool, Tool, type ToolContext } from "@nestjs-adk/core";
import { z } from "zod";

const schema = z.object({ city: z.string().describe("City name") });

@Tool({ name: "get_weather", description: "Current weather.", schema })
export class GetWeatherTool extends AdkTool<typeof schema> {
	public constructor(private readonly weather: WeatherService) {
		super();
	}

	public execute(input: z.infer<typeof schema>, context: ToolContext): unknown {
		return this.weather.fetch(input.city);
	}
}
```

The tool is a normal provider, so it injects services, repositories and anything else. Whatever `execute` returns goes back to the model, as long as it is serializable.

The two arguments come from different places. `input` comes from the model, which chose the values from the schema, and it is parsed before `execute` runs: `.default()` applies, coercions happen, and keys the model invented are dropped. `context` comes from the runtime and carries `sessionId`, `runId`, `agent`, `callId` and `signal`.

Nothing sensitive should be in the schema, because the model would be the one filling it in. A tenant id belongs to a repository the tool injects, keyed by something the runtime knows, and never to an argument the model can write. That is also why the parse drops undeclared keys: telling you to keep a tenant id out of the schema would mean little if a `{ ...input }` spread could carry a smuggled one into your query.

When a tool belongs to a single agent, skip the class and declare a method:

```ts
@Agent({ name: "support", description: "Customer support.", prompt: "..." })
export class SupportAgent extends AdkAgent {
	public constructor(private readonly orders: OrdersService) {
		super();
	}

	@Tool({ description: "Looks up an order by id.", schema: orderSchema })
	public lookupOrder(input: z.infer<typeof orderSchema>): unknown {
		return this.orders.find(input.orderId);
	}
}
```

The name defaults to the method name. Everything else works the same.

## Results the model has to look at

Some tools answer with something to be seen rather than read: an image, a PDF, a scanned invoice. Returning it as a normal result does not work, because a tool result is JSON and base64 inside it arrives as characters the model counts but cannot see.

Answer a `ToolOutput` instead, and the parts travel through the provider's own media channel:

```ts
import { AdkTool, MediaPart, Tool, ToolOutput } from "@nestjs-adk/core";

@Tool({ name: "read_invoice", description: "Loads an invoice.", schema })
export class ReadInvoiceTool extends AdkTool<typeof schema> {
	public async execute(input: z.infer<typeof schema>): Promise<ToolOutput> {
		const file = await this.files.get(input.name);
		return ToolOutput.with({ name: file.name }, [MediaPart.image(file.mimeType, file.base64)]);
	}
}
```

`ToolOutput.of(data)` is the plain form and `with(data, media)` is this one. The data still reaches the model as the tool's result; the media arrives alongside it.

The attachment reaches the model in the same turn, with the question already in context, and that ordering is the point. A description written when the file was uploaded answers "what colour is the shirt?" only if somebody guessed the question in advance, and "how many buttons?" is already lost. Letting the model look when it is asked costs one call instead of two, and those tokens land in `result.cost` like every other.

A model that never declared media input fails the call saying so rather than answering about nothing. The payload never enters the session history either: it is injected into the request being built and discarded with it, so a conversation with twenty attachments does not carry all twenty into every later turn. The model calls the tool again if it needs another look.

## Tools that arrive per run

The tools above are decided when you write the code. Some are not: if your users connect their own integrations, the set changes per person and only exists at runtime. That is what `ToolSource` is for.

A source declared in the module belongs to the application and opens on every run:

```ts
AdkModule.forRoot(
	AdkModuleOptions.from({
		defaultModel,
		runtime: RuntimeOptions.from({ sources: [new CompanyCatalogSource()] }),
	}),
);
```

A source declared on the call belongs to that run alone, which is where a credential that is somebody's rather than the application's goes:

```ts
const result = await this.assistant.ask(message, {
	sessionId,
	sources: await this.integrationsOf(user.id),
});
```

Both are opened, the module's first, and both are closed when the run ends: whether it answered, threw, or was aborted mid stream. Their tools join the ones the agent declares and are indistinguishable from them downstream: they go through argument validation, offload, approvals and events like any other.

```ts
export abstract class ToolSource {
	public abstract readonly name: string;
	public abstract open(
		sessionId: SessionId,
		runId: AgentRunId,
		signal?: AbortSignal,
	): Promise<readonly ToolDefinition[]>;
	public abstract close(runId: AgentRunId): Promise<void>;
}
```

An approval is a new run, minutes or days later, and whatever the suspended run had open is long closed. So a held call that came from a source needs the source declared again on the decision:

```ts
await this.assistant.approve(sessionId, callId, {
	by: "gabriel",
	sources: await this.integrationsOf(user.id),
});
```

Two failures are expected and neither ends the run. Throw `ToolSourceUnavailableError` when the source is unreachable: its tools are absent and the conversation continues with what is left. Throw `ToolSourceAuthError` when the user has to authorize again: the run journals a reauth event naming the source, which is what an application turns into a reconnect button. The distinction matters because reconnecting fixes one and not the other.

Omitting `sources` is harmless: the agent runs with what it declares and nothing else. Forgetting it costs you tools, never someone else's.

`@nestjs-adk/mcp` implements this contract for MCP servers.

## Skills

Skills are blocks of domain knowledge written as text. They exist so a prompt does not grow into one giant string. A skill is a method on the agent, decorated with `@Skill`:

```ts
@Agent({ name: "sales", description: "Sales department.", prompt: "..." })
export class SalesAgent extends AdkAgent {
	@Skill({ name: "tone", description: "How the salesperson talks.", mode: "always" })
	public tone(): string {
		return "Be direct and state the price with two decimal places.";
	}

	@Skill({ name: "club_policy", description: "Club and volume discount rules." })
	public clubPolicy(): string {
		return "A 10% discount applies from three copies of the same game.";
	}
}
```

`mode: "always"` puts the content in the instruction on every run, after the prompt, in the order the skills were declared. The default mode is on demand: the model sees only the names and descriptions, plus an `activate_skill` tool it calls when it decides it needs the content. That keeps the context small while the knowledge stays available.

A skill is read once, at boot, and never per run. It is fixed text by design: the thing that varies per run is the prompt.

## Prompts

There are two ways to give an agent its instruction. Pick one per agent: declaring both fails at startup, because a precedence rule would leave one of them looking configured while the model never sees it.

The first is a fixed text on the decorator:

```ts
@Agent({ name: "support", description: "...", prompt: "You are the store's support agent." })
export class SupportAgent extends AdkAgent {}
```

The second is a `prompt()` method on the agent. Use it when the instruction depends on data. Your agent is an ordinary NestJS provider, so whatever knows that data is a constructor argument:

```ts
@Agent({ name: "support", description: "..." })
export class SupportAgent extends AdkAgent {
	public constructor(private readonly customers: FindCustomerUseCase) {
		super();
	}

	protected override async prompt(context: PromptContext): Promise<string> {
		const customer = this.customers.execute(context.owner?.value ?? "");
		return this.prompting.renderFromFileOrFail("support.md", {
			name: customer.name,
			plan: customer.plan,
		});
	}
}
```

The method receives a `PromptContext`: the session id, the run id, the agent about to answer, the session's `owner` and the signal that stops the run. The owner is the key you look your own data up by, and you set it when the conversation starts:

```ts
await support.ask("where is my order?", { owner: user.email });
```

Putting the customer's data in the system prompt rather than in the message is the point. Text in the message is text the model has been told to treat as somebody else's words, and a name pasted into it is a place where a user can try to give instructions. Text in the system prompt is instruction.

### Three ways to get the text

`this.prompting` gives you:

```ts
this.prompting.render(template, vars); // text you already have
this.prompting.renderFromFile(path, vars); // undefined when there is no such prompt
this.prompting.renderFromFileOrFail(path, vars); // throws PromptNotFoundError instead
```

`render` needs no file and no source at all, so a prompt kept in your database is just a row you read and then render. Prefer `renderFromFileOrFail` for files: an agent answering without the instruction it was written around is worse than one that fails naming the missing file.

### Variables

`{{name}}` is optional and renders as nothing when nothing filled it. `{{{name}}}` is required, and a prompt missing one throws `MissingPromptVariablesError` naming every missing key at once. `null` counts as missing for both, so a column nobody filled reads the same as an argument nobody passed.

### Where the files live

By default a plain name is read from `./prompts`. Point that somewhere else with `prompts.dir`, and build the path from the file that owns the prompts so it does not depend on where the process was started:

```ts
AdkModule.forRoot(
	AdkModuleOptions.from({
		defaultModel,
		prompts: { dir: join(dirname(fileURLToPath(import.meta.url)), "prompts") },
	}),
);
```

An absolute path is used as it is, and a path starting with `./` or `../` is resolved from the working directory. Each file is read once and served from memory afterwards.

### Prompts that do not live on disk

To keep them anywhere else, implement `PromptSource` and pass it as `promptSource`. Your agents do not change: they pass a name, never a location, so the same `renderFromFileOrFail("support.md")` reads a bucket or a table depending only on what the module declared. The connection stays inside the source.

```ts
export class GcsPrompts extends PromptSource {
	// Nothing above this port caches, so the source does. It stores the read rather than the
	// result, so runs starting at once share one download.
	private readonly cache = new PromptFileCache();

	public constructor(
		private readonly storage: Storage,
		private readonly bucket: string,
	) {
		super();
	}

	public async load(name: string): Promise<string | undefined> {
		return await this.cache.through(name, async () => {
			const [body] = await this.storage.bucket(this.bucket).file(`prompts/${name}`).download();
			return body.toString("utf8");
		});
	}

	/** Ends up in the PromptNotFoundError message, so name the object and not just the file. */
	public override describe(name: string): string {
		return `gs://${this.bucket}/prompts/${name}`;
	}
}

AdkModule.forRoot(AdkModuleOptions.from({ defaultModel, promptSource: new GcsPrompts(storage, "prompts") }));
```

Three things are yours rather than the library's, and a remote source needs all three:

- **Caching.** A prompt is resolved once per agent per run, so a source that reads the network every time puts a round trip in front of every conversation. `PromptFileCache` is exported for exactly this.
- **Failure.** Whatever `load` throws ends the run. That is deliberate: an agent answering without the instruction it was written around is worse than a run that says why it stopped. If you would rather degrade than fail, answer a bundled or stale copy inside `load` instead of throwing.
- **Construction.** `promptSource` takes an instance, not a provider token, so it is built before the NestJS container exists, like `storage` and `pricing`. Whatever it depends on you build by hand alongside it.

Returning `undefined` from `load` is a normal answer, not a failure: `renderFromFile` answers `undefined` in turn and `renderFromFileOrFail` is the one that throws.

`promptSource` and `prompts.dir` cannot be declared together, because `prompts.dir` configures the source that the other one replaces.

### What a variable costs

A prompt built per run is a prompt the provider cannot cache. The system prompt is the head of the prefix, so anything that changes there invalidates everything after it. Measured on this project's own paid tests: 3031 of 3751 prompt tokens came back cached, which was 68% of that run's input bill.

So keep the variable part small and stable within a session. A customer name is fine. A timestamp is not. This is also why the method is called once per agent per run, before the first turn, and never once per turn.

The final instruction is always composed in the same order: the prompt, then the `always` skills, then the on demand catalog. Because the order is stable, the rest of your prefix stays identical between runs.

## Models

A model is an object, not a string. Provider packages ship one class each, and you construct it with the options that provider understands:

```ts
import { GeminiModel } from "@nestjs-adk/google";
import { OpenAiModel } from "@nestjs-adk/openai";

const flash = new GeminiModel("gemini-3.5-flash-lite", { apiKey, temperature: 0.2, maxOutputTokens: 512 });
const luna = new OpenAiModel("gpt-5.6-luna", { apiKey, body: { reasoning_effort: "none" } });
```

`defaultModel` on the module answers for every agent that declared none. An agent that wants its own passes it in the decorator:

```ts
@Agent({ name: "reporter", description: "Builds reports.", model: luna })
```

`OpenAiModel` covers every provider that speaks the OpenAI API, which includes OpenAI itself, OpenRouter, Ollama and many others, through its `baseUrl`. `GeminiModel` adds the Vertex options.

To route by something the model cannot know (load, cost, a feature flag), implement `ModelResolver` and declare it as `runtime.models`. It is asked once per run, before the first turn, so one run never changes model halfway through by accident.

### Failover

A list of models is a chain walked in order when the current one fails before answering:

```ts
@Agent({ name: "support", description: "...", failover: [flash, luna] })
```

When the decision needs logic, implement `AgentFailoverPolicy`:

```ts
export class GiveUpOnBadRequests extends AgentFailoverPolicy {
	public async next(failure: ModelFailure, context: FailoverContext): Promise<LlmModel | undefined> {
		if (failure.isInvalidRequest) return undefined; // every model refuses the same request
		return context.attempts.length === 0 ? flash : luna; // one retry, then degrade
	}
}
```

`ModelFailure` is data, not an exception: `RateLimitedFailure`, `TimeoutFailure`, `UnavailableFailure`, `ContextExceededFailure`, `SafetyBlockedFailure`, `InvalidRequestFailure` and `UnknownFailure`, each answering `isTransient` and `isInvalidRequest`. A provider adapter classifies its own errors into these, which is why the decision reads the same whoever failed.

`SequentialFailoverPolicy` is the built-in walk, and it stops on a refused request: every model in the chain is sent the same thing, so paying for four models to refuse it is not resilience. Two rules hold regardless of policy: a failure after the first chunk never fails over, because part of the answer already reached the consumer, and an aborted request never fails over. When the policy runs out, the run throws `ModelsExhaustedError` carrying every failure it collected.

Each call is billed under the model that served it, so a reroute shows up on its own line in `result.cost.byModel`.

### Restricting options per model

Some models reject parameters their siblings accept, and reasoning models often pin `temperature`. `createModelSpec` narrows the options at compile time from a map you own, since the library deliberately does not track per-model capabilities:

```ts
const MyGemini = createModelSpec(GeminiModel)<{
	"gemini-3.5-flash-lite": Omit<GeminiOptions, "temperature">;
}>();

new MyGemini("gemini-3.5-flash-lite", { temperature: 0.2 }); // compile error
new MyGemini("gemini-3.5-pro", { temperature: 0.2 }); // outside the map, full options
```

It is type-only: at runtime `MyGemini` **is** `GeminiModel`, with no extra behaviour.

### Your own model

When no provider package fits (an internal proxy, a provider without an OpenAI-compatible API, a plain HTTP call), extend `LlmModel`. Two methods: what the model is, and how it answers.

```ts
export class ClaudeViaProxy extends LlmModel {
	public constructor(private readonly http: ProxyClient) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "claude-sonnet-5"),
			ModelContextWindow.of(200_000, 8_000),
			ModelCapabilities.of([
				[ModelCapability.TOOLS, true],
				[ModelCapability.MEDIA_INPUT, true],
			]),
		);
	}

	public async *generate(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		const stream = await this.http.stream(toClaude(request), { signal });
		for await (const piece of stream) {
			if (piece.type === "text") yield ModelChunk.text(piece.delta);
			if (piece.type === "tool_use") {
				yield ModelChunk.toolCall(new ToolCallDelta(piece.index, piece.json, piece.id, piece.name));
			}
		}
		yield ModelChunk.usage(ModelUsage.of(stream.usage.in, stream.usage.out, stream.usage.cached));
		yield ModelChunk.finish("stop");
	}
}
```

The `ModelRequest` arrives ready, with the composed instruction, the conversation as `ModelMessage`s and the tool declarations, and you translate it to your provider's wire format. On the way back the runtime aggregates your chunks: text is a delta, tool calls accumulate by index, usage and finish reason are last one wins.

The descriptor is not decoration. The context window is what compaction measures against, and the capabilities are what the runtime checks before it accepts an attachment or offers tools: a model that never declared `MEDIA_INPUT` fails a question carrying an image instead of paying for a call that answers about nothing. `UnknownContextWindow` is the honest answer when you do not know the size; the runtime reports it rather than guessing.

Honour `signal` by stopping your upstream call when it fires. Keep the class stateless: one instance is shared by every run, and anything per request belongs inside `generate`, derived from the request.

## Sessions

Pass a `sessionId` and the conversation continues; leave it out and a new one starts. Every run is journaled as events, and the history is replayed into the model's context on the next one.

```ts
const first = await support.ask("where is my order?", { owner: user.email });
const second = await support.ask("and the other one?", first.sessionId);
```

Storage goes through `SessionStorage`. `InMemorySessionStorage` is the default and is right for development and tests. `SqliteSessionStorage` is shipped for a single process, and for anything else you implement the port:

```ts
AdkModule.forRoot(
	AdkModuleOptions.from({
		defaultModel,
		storage: new SqliteSessionStorage(new SqliteConnection("store.db")),
	}),
);
```

The journal is the source of truth. Snapshots exist only to avoid replaying a long conversation from the first event, are always disposable, and are governed by `runtime.snapshots` (`SnapshotPolicy`). A port that cannot do everything says so through `StorageCapabilities` rather than failing halfway.

### Writing a storage of your own

Everything an adapter needs is published, and it is codecs rather than parts. Each one turns a domain object into a record of plain values and back, so an adapter moves rows and never builds an event, a header, a projected state or a compacted block by hand:

```ts
import { SessionStorage, StorageCodecs, StoredSessionEvent } from "@nestjs-adk/core";

class PrismaSessionStorage extends SessionStorage {
	private readonly codecs = StorageCodecs.standard();

	public async *readEvents(sessionId: SessionId, after: SessionRevision) {
		for await (const row of this.cursorOf(sessionId, after)) {
			yield new StoredSessionEvent(sessionId, SessionRevision.of(row.revision), this.codecs.journal.decode(row));
		}
	}
}
```

`decode` takes the row your driver handed back, whichever shape it is in: a JSON column that arrived parsed and one that arrived as text are both accepted. What comes back is the event class the runtime decides on, which is the part that cannot be approximated. A plain object with the right fields passes every check in the runtime without matching one, and the conversation reads back as empty instead of failing.

Four codecs cover the four collections: `journal`, `snapshot`, `head` and `checkpoint`. `journal.fingerprintOf` is how a retried batch is told from an event id that came back carrying something else, which is what idempotent append means. The errors the port is expected to throw ship here too: `SessionNotFoundError`, `SessionAlreadyExistsError`, `SessionRevisionConflictError` and `JournalCorruptedError`.

Then prove it, with the same cases the adapters here answer. The suite lives in `@nestjs-adk/testing`, because measuring an adapter is testing:

```ts
import { SessionStorageContractSuite } from "@nestjs-adk/testing";

const suite = new SessionStorageContractSuite();
for (const contract of suite.cases(() => new PrismaSessionStorage(prisma))) {
	it(contract.name, () => contract.run());
}
```

The suite is data, not a test file, so vitest, jest and `node:test` all drive it. It reads your `capabilities()` and only demands what you claimed: a storage honest about being ephemeral is not held to optimistic concurrency, and one claiming durability is held to all four guarantees. It is written against this package's published API and nothing else, which is the same constraint your adapter is under.

`inspect` answers where a conversation stands without running anything:

```ts
const inspection = await support.inspect(sessionId);
inspection.isAwaitingApproval;
inspection.approval.awaiting; // the calls a human still has to answer
```

## Capping the loop

A lost model can call tools forever, and a broken tool can fail forever while the model retries. Both burn tokens. `RunLimits` caps three things:

```ts
AdkModule.forRoot(
	AdkModuleOptions.from({
		defaultModel,
		runtime: RuntimeOptions.from({ limits: RunLimits.of(16, 2) }),
	}),
);
```

`maxIterations` is how many model and tool round trips one run may take; past it the run throws `AgentMaxIterationsError`. `maxConsecutiveToolFailures` is a breaker per tool: the same tool failing that many times in a row throws `ToolRepeatedFailureError` without waiting for the bigger cap, and a success resets the count.

`maxInvalidArgs` is the third and the only one always on, defaulting to `2`. It counts how many times the model may call a tool with arguments the schema rejects. The first mistakes go back to the model as a result it can act on, because the model wrote the argument and usually fixes it next call, while throwing would kill a run over a missing field. Past the limit the run throws `ToolInvalidArgsError`. It only counts for declared tools: a tool from an external catalog carries the server's own schema, and a bad call comes back from the server as an error the model reacts to.

Three levels declare them, and each replaces the one above it field by field: the module, then the agent in `@Agent`, then the call. A field a level left out keeps whatever the level above decided, so an agent that only needs more round trips says only that.

```ts
@Agent({
	name: "sales",
	description: "Catalog, prices and quotes.",
	limits: RunLimits.of(16),
})
export class SalesAgent extends AdkAgent {}
```

Replacing is not narrowing: an agent that declares `16` runs under `16` even when the module said `8`. A sector that genuinely needs more round trips is the reason the field exists, and making it a ceiling would leave the application raising the module limit for everyone instead.

## Keeping the context small

Long conversations and big tool results both eat the window, and each has its own answer.

A tool result above 20 thousand characters is stored as an artifact, and the model gets a short summary plus a `read_artifact` tool it can call when it really needs the whole thing. `runtime.offload` decides the threshold: `OffloadPolicy.byDefault()`, `above(n)` or `disabled()`. `read_artifact` works on anything in `ArtifactStorage`, not only offloaded results, so an upload saved there can be pulled in on demand: text comes back as a normal result, binary comes back as media.

For long histories there is compaction. Declare a policy and the oldest closed exchanges are replaced by a summary once the conversation passes a threshold:

```ts
runtime: RuntimeOptions.from({
	compaction: new TokenThresholdCompactionPolicy(24_000, 12_000, 4),
	summarizer: new StoreSummarizer(flash),
});
```

The numbers are the ceiling that triggers it, the size to compact down to, and how many recent exchanges are never touched. The ceiling is measured against what the provider reported, so a conversation nobody has had is never compacted. Without a `ContextSummarizer` the same conversation simply forgets, which is why declaring one matters more than the thresholds: a customer who gave their order number ten turns ago should not have to give it again.

An agent may declare its own `compaction`, and like limits it replaces the module's rather than narrowing it. Here it is the whole policy that is replaced and not a field: two policies deciding how much to keep would be one of them shortening what the other just decided to hold on to.

## Transfer and delegation

Two agents can work on one conversation, and the difference is who owns it afterwards.

A **transfer** hands the conversation over. Whoever received it answers from then on, including on the next question:

```ts
@Agent({ name: "concierge", description: "Triage." })
@TransfersTo(SalesAgent, WarrantyAgent)
export class ConciergeAgent extends AdkAgent {}
```

A **delegation** asks somebody one question and keeps the conversation where it is. The answer comes back as the result of the call that asked for it:

```ts
@Agent({ name: "warranty", description: "Returns and warranties." })
@DelegatesTo(BillingAgent)
export class WarrantyAgent extends AdkAgent {}
```

Both give the model a tool (`transfer_to_agent`, `delegate_to_agent`) restricted to the targets you declared, and both are also available from code: `agent.delegate(sessionId, to, task)` runs one through the same edges and the same events. A target nobody declared is refused, at boot when it is not an agent at all and at run time when the edge does not exist.

A delegated run is a run of its own: its own model, tools, context and limits, resolved from scratch for the child. It writes to the same journal, its cost joins the parent's total once with the child's model listed separately, and neither agent reads the other's conversation. A chain three deep is refused, and so is a session handed back and forth more than eight times.

## Human approval

Some actions should not run without a person saying yes. The tool declares what it does to the world:

```ts
@Tool({ name: "issue_refund", description: "Refunds an order.", schema, effect: "destructive" })
```

The scale is ordered: `read` observes, `write` changes state the same API can undo, and `destructive` has no undo, which covers deleting but also sending an email or charging a card. A tool that declares no effect counts as `write`. A tool that arrived from a source carries the server's own annotation, and an unannotated one counts as `destructive`.

What pauses is policy, declared once for the runtime:

```ts
runtime: RuntimeOptions.from({ approvals: EffectApprovalPolicy.from(ToolEffect.DESTRUCTIVE) });
```

It reads as "from this level up, pause". `EffectApprovalPolicy.never()` is the default and pauses nothing. Implement `AdkApprovalPolicy` when the decision needs more than the effect.

When the model calls a tool at or above that level, the tool does not run. The run suspends and comes back with the call waiting:

```ts
const result = await support.ask("refund order A-1042", { sessionId });
result.isAwaitingApproval; // true
result.awaiting[0]?.callId; // what a human is answering about
```

Your application shows that to a person, and then:

```ts
await support.approve(sessionId, callId, { by: "gabriel" }); // runs the tool, resumes the run
await support.reject(sessionId, callId, "outside the window", { by: "gabriel" }); // tells the model why
```

Both return an ordinary `AgentResult`, so the conversation carries on. A turn holding two calls stays suspended until both are answered: running half of it would put an effect in the world nobody finished agreeing to.

The decision is a new run, minutes or days later and possibly in another process. Nothing is held in memory between the two: the pending call lives in the journal, and the runtime keeps no credentials. That is why a held call that came from a source needs `sources` declared again on the decision, and why short-lived credentials belong inside the tool rather than carried across the pause.

## Streaming

`stream` runs exactly what `ask` runs and hands you the pieces on the way past. The result is the generator's return value, not one of the chunks:

```ts
const run = support.stream("where is my order?", { sessionId });

for await (const chunk of run) {
	if (chunk.isText) process.stdout.write(chunk.text ?? "");
}

const result = (await run.next()).value; // the AgentResult, same as ask would answer
```

A `for await` alone discards the return value, which is the one trap here. `ModelChunk` also carries tool calls, usage and the finish reason, so a UI can show a tool running rather than a pause.

Token counts and cost are unaffected by streaming: usage is reported once per turn either way.

## Stopping a run

Breaking out of a stream stops the reading and nothing else. The provider goes on generating an answer nobody will see, and you are billed for it. `signal` is what ends the work:

```ts
const controller = new AbortController();
request.on("close", () => controller.abort());

const result = await support.ask("where is my order?", { sessionId, signal: controller.signal });
```

It reaches the model call and every tool the run invokes, and it takes anything the run delegated with it. The run ends by throwing, and the journal records `run.cancelled` rather than `run.failed` or `run.completed`, so a stopped run is distinguishable from a broken one when you read the history back.

A signal that has already aborted ends the run before it calls anything, which is what makes the button work in the moment it is usually pressed: before the first chunk arrives. `approve` and `reject` take one too, since a released turn is a run of its own.

## Watching a run

A consumer is told about everything that happened, in order, after it was committed:

```ts
export class RunAudit extends SessionEventConsumer {
	public readonly name = "audit";

	public async consume(event: PublishedEvent): Promise<void> {
		await this.log.write(event.type, event.payload);
	}
}

runtime: RuntimeOptions.from({ consumers: [new RunAudit()] });
```

Events are the journal, so a consumer sees what was recorded rather than what was intended. A consumer that throws does not take the run with it, and `consumerNotices` is where those failures are reported. `contextNotices` does the same for a context whose size nobody could measure.

To see what a run would send without paying for it, ask the agent to explain it:

```ts
const contexts = await support.explain("where is my order?", { sessionId });
contexts[0]?.instruction; // the composed system prompt
contexts[0]?.messages; // the conversation as the model would receive it
```

`explain` runs the real assembly, stops in front of the provider call and answers a `ContextSnapshot` per call it would have made. It is a debugging tool and it holds the whole prompt, so keep it away from an endpoint end users can reach.

## Cost

Declare one pricing source in the module and every run reports what it cost:

```ts
AdkModule.forRoot(
	AdkModuleOptions.from({
		defaultModel,
		runtime: RuntimeOptions.from({ pricing: new LiteLLMPricingSource() }),
	}),
);
```

```ts
const result = await support.ask(message);

result.cost.total.toString(); // "0.000334", exact, no exponent
result.cost.calls; // 2
result.cost.isComplete; // true
result.cost.byModel[0]?.model.toString(); // "google/gemini-3.5-flash-lite"
```

Prices come from the catalog LiteLLM maintains. `LiteLLMPricingSource` reads it when the first run asks for a price, keeps only the per token rates, and serves them from memory for a day. A read that fails keeps whatever table was already loaded, and it is not retried on the next question: a catalog that is down must not turn a degraded report into a load problem.

Each call is billed under the model that actually served it, so a failover lands on its own line in `byModel` instead of being attributed to the agent's declared model. A delegation's cost is added to the parent's total once, with the child's model listed separately. Cached prompt tokens are discounted from the prompt rather than added to it, and models whose price grows past a context threshold switch band by the real token count of the call.

### Money is exact

Amounts are `UsdAmount`, an integer count of pico dollars held as a `bigint`. That is a measured decision rather than a preference: the cheapest rate in the catalog is `1.3e-10` per token, which a nano unit truncates to zero, and `Number.MAX_SAFE_INTEGER` in pico dollars is about 9007 dollars, which an accumulator reaches.

```ts
result.cost.total.toString(); // "0.0000088"  exact decimal, what a NUMERIC column wants
result.cost.total.pico; // 8800000n         exact integer, for arithmetic
result.cost.total.toNumber(); // 8.8e-6     lossy: for a chart, never for a bill
```

`JSON.stringify` on a result answers the exact decimal string, so a controller can return an `AgentResult` unchanged.

### Posting to a ledger

If these numbers go into a ledger rather than a dashboard, do not read `total` alone. `ModelCost` carries a `breakdown` with `input`, `output` and `cached` as separate amounts, which is what a billing row usually wants as separate columns, plus the `usage` those amounts were computed from, so a row can be reconciled against an invoice. It deliberately carries no rates: calls with different prompt sizes can land in different bands, so one rate for the aggregate would be a fiction. Rates are on the call, where they are unambiguous.

One thing worth planning for: `byModel` is a list. A run that failed over or delegated touches two models, so a schema with one model name per transaction has no room for it.

### Nothing is ever guessed

A model the source does not know, a source that throws, a price with a hole in it, a provider that reported no tokens: every one of them ends the same way. The model is named in `cost.unpriced`, its tokens stay out of the total, and `cost.isComplete` is false. You get a number that is smaller than the invoice and says so, instead of one that looks right and is not.

Declaring no source at all is the same story: every run answers a cost of zero with `isComplete` false. To find out why, implement the sink:

```ts
export class LoggingNotices extends PricingNoticeSink {
	public report(notice: ModelUnpriced): void {
		this.logger.warn(notice.message);
		// "google/gemini-9-imaginary billed 813 tokens that were left out of the total: unknown-model."
	}
}
```

Nothing about pricing can fail a run. The sink is off the path of every decision, including when it throws.

### Your own source

The catalog is community data read at runtime, so whatever upstream publishes becomes your cost numbers within a day. When you need negotiated rates, reproducible figures or your own cache, implement the port:

```ts
export class ContractPricing extends PricingSource {
	public async priceOf(model: ModelIdentity): Promise<ModelPrice | undefined> {
		const agreed = this.rates[model.model];
		if (agreed === undefined) return undefined;
		return ModelPrice.of(TokenRate.fromUsdPerToken(agreed.in), TokenRate.fromUsdPerToken(agreed.out));
	}
}
```

Returning `undefined` is a normal answer and not a failure. There is one source for the whole module and no per agent or per model override: a bill that can be overridden in three places is a bill nobody can explain, and the cases that want one are better served by a source of your own.

## Embeddings

`Embedder` is a port with no default implementation, so you bring the provider you prefer. Declare it once and inject it by type anywhere:

```ts
AdkModule.forRoot(AdkModuleOptions.from({ defaultModel, embedder: new GeminiEmbedder() }));
```

```ts
@Injectable()
export class SearchService {
	public constructor(private readonly embedder: Embedder) {}

	public async vectorOf(text: string): Promise<EmbeddingVector> {
		return this.embedder.embed(text);
	}
}
```

An application that declares none still boots and still injects: only code that actually embeds fails, naming the option to declare. `@nestjs-adk/google` ships `GeminiEmbedder`, and the `Similarity` provider offers cosine similarity over the vectors.

Indexing a corpus is often the larger half of a bill, and none of it is a turn, so `AgentResult.cost` never sees it. `PricedEmbedder` asks the same question about an embedding, through the same source:

```ts
const priced = new PricedEmbedder(embedder, reporter);
const { vector, cost } = await priced.embed(text);
```

That only produces a number when the provider reports usage, which today most do not: Google's `embedContent` answers a `billableCharacterCount` and only on Enterprise, and nothing there counts tokens. An embedder that can report extends `MeteredEmbedder` and answers `embedMetered`. One that cannot lands in `cost.unpriced` with a notice, because estimating tokens from characters would put a number in a report that no invoice will match.

## Without NestJS

The runtime does not depend on the container. `AdkRuntimeHost` composes it from agents you built yourself, which is how the provider packages test against a real model:

```ts
const host = new AdkRuntimeHost();
const started = await host.start([declaredAgent], storage, artifacts, clock, ids, runtimeOptions);
const result = await started.runtime.runner.ask(new AgentRunCommand(AgentName.from("support"), askInput));
await host.stop();
```

This is the low level surface: no decorators, no discovery, and you assemble the `AgentDefinition` yourself. Reach for it when you are embedding the runtime somewhere NestJS is not, and use the module everywhere else.

## Errors

Everything the library throws extends `AdkError` and carries a stable `code` for a catch block or a log, independent of the message. Each class documents itself in its own JSDoc, with the facts a handler needs exposed as readonly fields; your editor is the reference.

Two rules worth knowing. A configuration mistake throws at boot, naming the provider that caused it, so it never reaches a request. And a failure the runtime can decide about is not an error at all: a rate limited model is a `ModelFailure`, which is data a failover policy reads, and it only becomes `ModelsExhaustedError` when the decisions run out.

What exists, by subsystem:

| Subsystem | Errors |
| --- | --- |
| Boot and wiring | `UnusableComponentError`, `UnregisteredToolError`, `NotAnAgentClassError`, `NotAToolClassError`, `AgentNotBoundError`, `AmbiguousAgentPromptError`, `ConflictingPromptOptionsError`, `EmbedderNotDeclaredError`, `HostNotStartedError` |
| Agents and routing | `ModelsExhaustedError`, `TransferNotDeclaredError`, `DelegationNotDeclaredError`, `UnknownTransferTargetError`, `UnknownDelegationTargetError`, `DelegationSuspendedError`, `AgentMaxTransfersError`, `AgentMaxDelegationDepthError` |
| Runs and limits | `AgentMaxIterationsError`, `InvalidRunLimitError`, `ApprovalNotPendingError` |
| Models and media | `ModelCallFailedError`, `EmptyModelResponseError`, `UnsupportedCapabilityError`, `UnsupportedMediaTypeError`, `MalformedMediaError`, `MediaTooLargeError`, `MalformedToolCallError`, `InvalidStructuredOutputError` |
| Tools | `ToolNotFoundError`, `ToolInvalidArgsError`, `ToolRepeatedFailureError`, `ToolApprovalRequiredError`, `ToolSourceUnavailableError`, `ToolSourceAuthError` |
| Prompts | `PromptNotFoundError`, `MissingPromptVariablesError`, `PromptFileUnreadableError` |
| Context and artifacts | `InvalidCompactionThresholdError`, `ArtifactNotFoundError`, `TamperedArtifactReferenceError`, `AttachmentNotStoredError` |
| Skills | `DuplicateSkillNameError` |
| Cost and pricing | `NegativeAmountError`, `CatalogUnreachableError`, `MalformedCatalogError` |
| Embeddings | `EmptyVectorError`, `IncompatibleVectorsError` |
| Diagnostics | `NotEnoughRunsError` |

## Testing

Testing deserves its own package. [`@nestjs-adk/testing`](https://www.npmjs.com/package/@nestjs-adk/testing) gives you a scripted fake model, doubles over the real tool instances, Vitest matchers and an LLM-as-judge helper. Your test setup stays plain `@nestjs/testing`.

## API reference

Everything the package exports, and nothing else: a name that is not here is not part of the public surface. Errors are in the table above.

### Declaring an application

| Symbol | What it is for |
| --- | --- |
| `AdkModule` | The one module to import. `forRoot(options)` |
| `AdkModuleOptions`, `AdkModuleOptionsInput`, `AdkModuleOptionsPatch` | What the module takes: model, storage, artifacts, clock, ids, runtime, embedder, prompts |
| `PromptFileOptions` | The `prompts` field: which directory the default source reads |
| `RuntimeOptions`, `RuntimeOptionsPatch` | What the runtime takes: limits, approvals, consumers, sources, pricing, compaction, snapshots, shutdown |
| `ShutdownOptions` | How long a shutdown waits for runs in flight |
| `SnapshotPolicy` | How often the journal is snapshotted |
| `ADK_OPTIONS`, `ADK_DEFAULT_MODEL`, `ADK_EVENT_CONSUMERS`, `ADK_RUNTIME_PATCH` | Tokens to override when a test or an application replaces one piece |

### Declaring an agent

| Symbol | What it is for |
| --- | --- |
| `Agent`, `AgentOptions` | The decorator that makes a class an agent: `name`, `description`, `prompt`, `tools`, `model`, `failover`, `compaction`, `limits` |
| `AdkAgent` | Extend it to inject the agent as itself and to override `prompt()` |
| `Tool`, `ToolOptions`, `ToolDecorator`, `ToolClass` | The decorator, on a class or on an agent method |
| `AdkTool` | Extend it for a shared tool, typed by its Zod schema |
| `Skill`, `SkillOptions`, `SkillMode` | Knowledge as text, always composed or loaded on demand |
| `TransfersTo`, `DelegatesTo` | The edges an agent may hand a conversation or a task across |
| `AgentTarget`, `AgentClass` | What those decorators accept, including a lazy reference |
| `AgentMetadata`, `ToolMetadata` | Reads back what a decorator declared, for tooling |

### Running an agent

| Symbol | What it is for |
| --- | --- |
| `AgentRegistry` | Reaches an agent by name, for a class that extends something else |
| `AgentHandle` | One agent as an application holds it: `ask`, `stream`, `approve`, `reject`, `delegate`, `inspect`, `explain` |
| `AskOptions` | `sessionId`, `media`, `sources`, `owner`, `signal` |
| `DecisionOptions` | `by`, `sources` and `signal`, for an approval or a rejection |
| `AgentResult` | What a run answered: text, ids, status, awaiting, cost |
| `AgentRunStatus` | Completed, suspended, failed |
| `PendingCall` | A call waiting for a human |
| `SessionInspection` | Where a conversation stands, without running anything |
| `SessionId`, `AgentRunId`, `ToolCallId`, `AgentName` | The identities that appear in every result and event |
| `SessionMode`, `SessionOwner`, `SessionRevision` | Ephemeral or durable, who owns it, and where its journal is |
| `RunLimits` | Iterations, consecutive tool failures, invalid arguments |

### Prompts

| Symbol | What it is for |
| --- | --- |
| `PromptContext` | What `prompt()` receives: session, run, agent, owner, signal |
| `AgentPrompting` | `render`, `renderFromFile`, `renderFromFileOrFail`, reached as `this.prompting` |
| `PromptSource` | Implement it to serve prompts from anywhere |
| `FileSystemPromptSource` | The default: `.md` files from a directory |
| `PromptFileReader`, `FsPromptFileReader` | The one call the filesystem source makes, and its real implementation |
| `PromptFileCache` | One read per file, shared between concurrent runs. Reuse it in your own source |
| `PromptTemplate` | `{{optional}}` and `{{{required}}}` interpolation on its own |
| `PromptInstructions` | The composed instruction a request carries |
| `PromptBuilder`, `MethodPromptBuilder`, `AgentPromptScan` | How the runtime reaches an overridden `prompt()` |

### Models

| Symbol | What it is for |
| --- | --- |
| `LlmModel` | Extend it to add a provider of your own |
| `ModelDescriptor`, `ModelIdentity`, `ModelCapabilities`, `ModelCapability` | What a model is and what it can do |
| `ContextWindow`, `ModelContextWindow`, `UnknownContextWindow` | The size compaction measures against |
| `ModelRequest`, `ModelMessage`, `UserMessage`, `AssistantMessage`, `ToolCallMessage`, `ToolResultMessage` | The turn as an adapter receives it |
| `MediaPart`, `MediaLimits` | Something the model looks at, and what a provider accepts |
| `ToolDeclaration` | A tool as the provider is told about it |
| `ModelChunk`, `ToolCallDelta`, `ModelResponse`, `ModelUsage`, `TokenCount` | What an adapter yields on the way back |
| `ModelSpec`, `TypedModelSpec`, `createModelSpec` | Narrowing a provider's options per model, at compile time |
| `ModelResolver` | Decide which model answers a run, by something the model cannot know |
| `ModelExecutor` | The one call site of a model, with failover applied |
| `ModelFailure` and `RateLimitedFailure`, `TimeoutFailure`, `UnavailableFailure`, `ContextExceededFailure`, `SafetyBlockedFailure`, `InvalidRequestFailure`, `UnknownFailure` | A failure as data, for a policy to decide on |
| `AgentFailoverPolicy`, `SequentialFailoverPolicy`, `FailoverContext`, `ModelReroute` | What to try next, and what happened when it was tried |

### Tools

| Symbol | What it is for |
| --- | --- |
| `ToolContext` | What a tool is told about the run calling it |
| `ToolOutput` | An answer that carries media alongside the data |
| `ToolEffect` | `read`, `write`, `destructive` |
| `AdkApprovalPolicy`, `EffectApprovalPolicy` | What pauses in front of a human |
| `ToolInvocation` | The call a policy decides about |
| `ToolSource` | Tools that only exist at run time |
| `ToolDefinition`, `ToolHandler` | What a source builds, and the code behind it |
| `ToolSchema`, `ZodToolSchema`, `JsonSchemaToolSchema` | Arguments described to the model and validated on the way in |
| `ParsedArguments` | What a schema answers: the arguments, or why they were refused |

### Sessions, storage and events

| Symbol | What it is for |
| --- | --- |
| `SessionStorage`, `StorageCapabilities` | Where the journal lives, and what a port can do |
| `InMemorySessionStorage`, `SqliteSessionStorage`, `SqliteConnection` | The two the library ships |
| `ArtifactStorage`, `InMemoryArtifactStorage` | Where a large result or an upload lives |
| `OffloadPolicy` | When a result becomes an artifact instead of a message |
| `SessionEventConsumer`, `PublishedEvent` | Being told what happened, after it was committed |
| `ConsumerNoticeSink` | Where a consumer's own failure is reported |
| `ChunkSink` | Watching the pieces of a turn as they arrive |
| `Clock`, `SystemClock`, `Instant`, `IdGenerator`, `RandomIdGenerator` | The two things a runtime cannot invent for itself |
| `Secret` | A value that must not print itself in a log |

Implementing `SessionStorage` or `ArtifactStorage` means naming what their methods pass around, so those types are public too: `AppendEventsCommand` and `AppendEventsResult` for an append, `StoredSessionEvent` for what comes back, `Session` and `SessionSnapshot` for the head of a conversation and its disposable summary, `ContextCheckpoint` for what compaction leaves behind, and `ArtifactId`, `ArtifactContent` and `ArtifactReference` for a stored artifact. `ConsumerFailed` and `ContextWindowUnknown` are what the two notice sinks receive.

Writing a `SessionStorage` needs more than the names in its signatures, and the rest is published here for the same reason `PromptFileCache` is: implementing a port is something an application does.

| Symbol | What it is for |
| --- | --- |
| `StorageCodecs` | The four codecs as one thing: `journal`, `snapshot`, `head`, `checkpoint` |
| `JournalCodec` | An event as a row and back, with `fingerprintOf` for idempotent append |
| `SnapshotCodec`, `SessionHeadCodec`, `CheckpointCodec` | The other three collections a storage keeps |
| `ModelMessageCodec` | One message of a compacted context, if you store blocks yourself |
| `JournalRecord`, `SnapshotRecord`, `SessionHeadRecord`, `CheckpointRecord` | What each codec answers: plain values a column can hold |
| `StoredRow` | Reads a driver's row and says which column broke, instead of failing later |
| `SessionNotFoundError`, `SessionAlreadyExistsError`, `SessionRevisionConflictError`, `JournalCorruptedError` | The endings the port is required to produce |
| `UnreadableStoredValueError`, `InvalidStoredRowError` | A row this build cannot read, named by column |
| `SessionEventBatch`, `SessionEvent`, `SessionEventRegistry`, `SessionEventCodecs` | What an append carries, and the registry an application with its own upcasters hands over |
| `ContractSuite`, `ContractCase` | A port contract as data, which is what `SessionStorageContractSuite` is built from |

`SessionStorageContractSuite` itself is in `@nestjs-adk/testing`, next to the test bed.

### Context

| Symbol | What it is for |
| --- | --- |
| `AdkCompactionPolicy`, `TokenThresholdCompactionPolicy` | When a conversation is shortened |
| `ContextBudget`, `CompactionDecision` | What a policy is told, and what it answers |
| `CompactionStrategy`, `ContextProjection` | How it is shortened, if you replace the default, and what it works on |
| `ContextSummarizer` | What the removed turns are replaced by |
| `ContextBlock` | The unit a summarizer is handed |
| `ContextNoticeSink` via `RuntimeOptions.contextNotices` | Where an unmeasurable window is reported |
| `ContextSnapshot`, `ContextSegment` | What `explain` answers, and its parts |
| `PrefixComparator` | Compares two snapshots, which is how prefix stability is measured |
| `RunObservers` | Plugging a chunk sink and a context capture into one run |

### Cost

| Symbol | What it is for |
| --- | --- |
| `RunCost`, `ModelCost`, `CostBreakdown` | What a run cost, per model, split by input, output and cached |
| `UsdAmount`, `TokenRate` | Exact money, and a price per token |
| `ModelPrice`, `PriceBand` | The rates a source answers with, and a rate that changes past a context size |
| `PricingSource` | Where prices come from |
| `LiteLLMPricingSource`, `LiteLlmPricingOptions` | The community catalog, read at runtime |
| `CatalogTransport`, `HttpCatalogTransport`, `LiteLlmCatalogProjection` | How that catalog is fetched and read |
| `PricingNoticeSink`, `ModelUnpriced`, `UnpricedReason` | Why something was left out of a total |

### Embeddings

| Symbol | What it is for |
| --- | --- |
| `Embedder` | The port, with no default: bring your own provider |
| `MeteredEmbedder`, `MeteredEmbedding` | An embedder that can report what it billed, and what it answers |
| `PricedEmbedder` | Prices an embedding through the same source a run uses |
| `EmbeddingVector`, `Similarity` | A vector, and cosine similarity over two |
| `UndeclaredEmbedder` | What is injected when none was declared, so only code that embeds fails |

### Embedding the runtime

| Symbol | What it is for |
| --- | --- |
| `AdkRuntimeHost`, `StartedRuntime`, `RuntimeServices` | Composing the runtime without a container |
| `AgentRunCommand` | One run, resolved, for that path |
| `AgentDefinition`, `AgentDescription` | An agent as the runtime knows it, which you assemble yourself there |
| `StructuredOutputValidator`, `JsonStructuredOutputValidator` | The seam a request's output schema is validated through |
| `AdkError` | The base of every error the library throws |

## Learn more

The full project, with a working playground app and real AI smoke tests, lives at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).

## About this project

A disclaimer worth putting in writing: this library was built largely with [Claude Code](https://claude.com/claude-code). Most of the code you are reading was written by an AI, directed and reviewed by a human.

It exists because of real problems. Across Google ADK, Cline ADK and agents wired by hand, I kept solving the same things from scratch: the run loop, cost accounting, how a tool is declared, how MCP servers are registered, how the context is kept under control, where prompts live, how skills become a first-class tool, and how a run reports what it is doing. nestjs-adk is that pile of problems turned into one set of conventions, inside a framework I already trust.

So even though the core is mostly AI-written, the pieces I believe a good ADK must have are already in place. The current phase is not about new surface area: it is fixing bugs, raising the quality of the code, improving performance and sharpening DX.

DX is what drives every decision here. The clearer this library is to an AI reading it, the faster anyone ships good agents with it, and that is the whole bet. It also means breaking changes: expect several major releases, each one following semver strictly, whenever a change makes the framework easier to understand.

This is not an attempt to compete with Google ADK or Cline ADK. The goal is narrower: an agent toolkit that feels native to NestJS.

If you are an experienced developer, open the code and tell me where it is wrong. Issues and PRs about design, naming, patterns and the conventions that should guide maintenance are the most valuable contribution this project can get.
