# @nestjs-adk/core

**Build AI agents the NestJS way.**

NestJS developers already know how to build good software: classes, modules, providers and dependency injection. nestjs-adk brings AI agents into that same world. An agent is a class with a decorator. A tool is a provider. Everything is injected, validated and tested like the rest of your app.

This package is the framework itself. It gives you the decorators, the module, the run loop and all the contracts. To actually talk to an LLM you also install an engine, and the first supported engine is the Google ADK:

```bash
npm i @nestjs-adk/core @nestjs-adk/google
```

## Your first agent

Start by registering the module once, in your root module. This is where you choose the engine and the default model:

```ts
import { AdkModule } from "@nestjs-adk/core";
import { GoogleAdkEngine } from "@nestjs-adk/google";

@Module({
	imports: [
		AdkModule.forRoot({
			engine: GoogleAdkEngine,
			defaultModel: "gemini-2.5-flash",
		}),
	],
	providers: [SupportAgent, LookupOrderTool, OrdersService, ChatService],
})
export class AppModule {}
```

Now create the agent. It is a class that extends `AdkAgent` and is described by the `@Agent` decorator:

```ts
import { Agent, AdkAgent } from "@nestjs-adk/core";

@Agent({
	name: "support_agent",
	description: "Customer support.",
	prompt: "You are the store's support agent.",
	tools: [LookupOrderTool],
})
export class SupportAgent extends AdkAgent {}
```

Notice that the agent went into `providers` like any other class. There is no special registration step. If you forget to register a tool, a prompt class or a sub-agent, the app fails at startup with an error that points at the missing class, so configuration mistakes never reach runtime.

To use the agent, inject it. The instance itself is the handle:

```ts
@Injectable()
export class ChatService {
	constructor(private readonly support: SupportAgent) {}

	async answer(sessionId: string, message: string) {
		const { text } = await this.support.ask({ sessionId, message });
		return text;
	}
}
```

`ask()` runs the agent and returns the final result. `stream.ask()` gives you the same run as events, one by one, while the agent works. Later in this document you will also meet `approve()` and `reject()`, used for human approval; each verb exists in both flavors, aggregated at the top level and streaming under `stream`.

That is the whole mental model: configure the module once, register classes as providers, inject the agent and call it.

## Tools

A tool is something the model can decide to call. In nestjs-adk a shared tool is a class that extends `AdkTool`. The Zod schema plays two roles at the same time: it tells the model what arguments exist, and it types the input for you:

```ts
import { Tool, AdkTool, type ToolContext } from "@nestjs-adk/core";
import { z } from "zod";

const schema = z.object({ city: z.string().describe("City name") });

@Tool({ name: "get_weather", description: "Current weather.", schema })
export class GetWeatherTool extends AdkTool<typeof schema> {
	constructor(private readonly weather: WeatherService) {
		super();
	}

	execute(input: z.infer<typeof schema>, ctx: ToolContext) {
		return this.weather.fetch(input.city);
	}
}
```

The tool is a normal provider, so it can inject services, repositories or anything else. Whatever `execute` returns goes back to the model, as long as it is serializable.

The `execute` method receives two very different things. The `input` comes from the model: it decided the values based on the schema. The `ctx` comes from your application: it carries `userId`, custom `attributes` and the session `state` that you passed to `ask()`. This separation matters for security. Sensitive data like a tenant id should never be part of the schema, because the model could invent it. Pass it through `ctx` instead, where the model cannot touch it.

The input is parsed with the schema before `execute` runs, so `z.infer` describes what you actually get: `.default()` applies, coercions happen, and keys the model invented are dropped. That last one is the security half of the separation above: telling you to keep a tenant id out of the schema would mean little if the model could smuggle one in anyway and a `{ ...input }` spread carried it into your query.

When a tool belongs to a single agent, you can skip the class and declare it as a method on the agent itself:

```ts
@Agent({ name: "support_agent", description: "Customer support.", prompt: "..." })
export class SupportAgent extends AdkAgent {
	constructor(private readonly orders: OrdersService) {
		super();
	}

	@Tool({ description: "Looks up an order by id.", schema: orderSchema })
	lookupOrder(input: z.infer<typeof orderSchema>) {
		return this.orders.find(input.orderId);
	}
}
```

## Attachments

Some tools return things the model should look at rather than read. An image, a PDF, a scanned invoice. Returning those as a normal result does not work: a function response is JSON, so base64 inside it arrives as characters the model counts but cannot see.

Wrap the parts in `toolContent` and they travel through the provider's content channel instead:

```ts
import { Tool, AdkTool, toolContent } from "@nestjs-adk/core";

@Tool({ name: "view_attachment", description: "Loads an attachment.", schema })
export class ViewAttachmentTool extends AdkTool<typeof schema> {
	async execute(input: z.infer<typeof schema>) {
		const file = await this.files.get(input.name);
		return toolContent([{ data: { mimeType: file.mimeType, base64: file.base64 } }]);
	}
}
```

The attachment reaches the model in the same turn, with the user's question already in context. That ordering is the point. A description written when the file was uploaded answers "what colour is the shirt?" only if somebody guessed that question in advance, and "how many buttons?" is already lost. Letting the model look at the file when it is asked costs one call instead of two, and the tokens land in `run.cost` like everything else.

Each part is routed by its mime type. Images, audio, video and PDF go inline as bytes. Text-like formats (`text/*`, JSON, CSV, XML, YAML) are decoded, so the model gets characters instead of base64. Anything else is described rather than sent: a spreadsheet is the honest case, since XLSX is a zip and no model reads it. Convert those to CSV before returning them.

The payload never enters the session history. It is injected into the request being built and discarded with it, so a conversation with twenty attachments does not carry all twenty into every later turn. The model calls the tool again if it needs another look.

## Tools that arrive per run

The tools above are decided when you write the code. Some are not: if your users connect their own integrations, the set changes per person and only exists at runtime. That is what `AdkToolSource` is for.

```ts
const run = await this.assistant.ask({
	message,
	sources: await this.integrationsOf(user.id),
});
```

A source is opened while the agent is resolved and closed when the run ends, whether it succeeded, threw, or the consumer walked away from the stream. Its tools join the ones the agent declares and are indistinguishable from them downstream: they go through argument validation, offload, approvals and events like any other.

```ts
export abstract class AdkToolSource {
	abstract readonly name: string;
	abstract open(ctx: ToolSourceContext): Promise<ResolvedTool[]>;
	abstract close(): Promise<void>;
}
```

Two failures are expected and neither ends the run. Throw `ToolSourceUnavailableError` when the source is unreachable: its tools are absent, the conversation continues, and the agent works with what is left. Throw `ToolSourceAuthError` when the user has to authorize again: the source lands in `run.reauth`, which is what an application turns into a reconnect button.

```ts
if (run.reauth.length > 0) {
	return { text: run.text, reconnect: run.reauth.map((item) => item.source) };
}
```

The distinction matters because reconnecting fixes one and not the other. The model is told about both, so it can explain the situation instead of pretending the capability never existed.

Two sources answering to the same `name` is a configuration error and fails immediately, before any connection is attempted. The name identifies where a tool came from, so a duplicate would leave the model with two identical tools and no way to choose.

Omitting `sources` is harmless: the agent runs with what it declares and nothing else. Forgetting it costs you tools, never someone else's.

`@nestjs-adk/mcp` implements this contract for MCP servers.

## Skills

Skills are blocks of domain knowledge written as text. They exist so your prompt does not grow into one giant string. A skill can be a class that extends `AdkSkill` with the `@Skill` decorator, or a method on the agent.

Each skill has a mode. With `mode: "always"` the content is included in the instruction on every run. The default mode is on demand: the agent only sees a catalog with the skill names and descriptions, plus a `load_skill` tool it can call when it decides it needs the full content. This keeps the context small while still making the knowledge available.

## Prompts

There are two ways to give an agent its instruction, and they are separate fields so the intent is always clear.

The first way is directly on the decorator. Use `prompt` for literal text and `promptFile` for a markdown file:

```ts
@Agent({ name: "support", prompt: "You are the store's support agent." })

@Agent({ name: "support", promptFile: "agents/support/main.prompt.md" })

@Agent({ name: "support", promptFile: "./prompts/main.prompt.md" })
```

A plain `promptFile` path is resolved from the prompts directory that you configure in `forRoot({ prompts: { dir } })`. A path that starts with `./` is resolved relative to the agent's own file. Files are read once and cached in memory.

The second way is a builder class, for prompts that need logic or data. Extend `AdkPrompt`, register it as a provider and point the `prompt` field at the class:

```ts
@Injectable()
class SupportPrompt extends AdkPrompt {
	constructor(private readonly config: SupportConfig) {
		super();
	}

	build(ctx: PromptContext) {
		return this.fromFile("agents/support/main.prompt.md", {
			tone: this.config.tone,
			plan: ctx.state.get("plan"),
		});
	}
}

@Agent({ name: "support", prompt: SupportPrompt })
```

The builder has full dependency injection and receives the run context, so it can read the state and the attributes you passed to `ask()`. The `fromFile` helper reads a cached template and fills `{{var}}` placeholders.

Setting both `prompt` and `promptFile` on the same agent is an error at startup. One agent, one source of instruction.

The final instruction is always composed in the same order: the prompt, then the `always` skills, then the on demand catalog. Because the order is stable, the prefix of your requests stays identical between runs, which lets the provider cache it.

## Models

The `model` field on `@Agent` and the `defaultModel` on `forRoot` accept a string, a model spec class or your own model implementation. Specs are small objects that only carry configuration. The engine turns them into real clients:

```ts
model: "gemini-2.5-flash"

model: new Gemini("gemini-2.5-flash", { temperature: 0.2, topP: 0.9, stopSequences: ["END"] })

model: new OpenAiLike("gpt-4o-mini", { baseUrl, apiKeyEnv })

model: new Gemini("gemini-2.5-flash", {
	temperature: 0.1,
	failover: [new OpenAiLike("gpt-4o-mini", { baseUrl: "https://openrouter.ai/api/v1" })],
})
```

The universal generation parameters (`temperature`, `topP`, `topK`, `maxOutputTokens`, `frequencyPenalty`, `presencePenalty` and `stopSequences`) are first-class typed fields, so a typo fails to compile. Provider-specific options still go through each spec's escape hatch (`config` on `Gemini`), and when both declare the same parameter, the typed field wins. A spec's configuration applies wherever the spec is used: as the agent's model, as a failover target or as the compaction summarizer.

`OpenAiLike` covers every provider that speaks the OpenAI API, which includes OpenAI itself, OpenRouter, Ollama and many others. `Gemini` lives in `@nestjs-adk/google` and adds Vertex AI options, billing labels and explicit content caching.

Failover is a property of the model itself, not a separate concept. The array form walks the list in declared order when the current model fails before the first chunk of the response, for example with a 429. When the decision needs logic, `failover` accepts a function instead:

```ts
model: new Gemini("gemini-2.5-flash", {
	failover: (error, { currentModel, failures }) => {
		if (httpStatusOf(error) === 400) return undefined; // will fail the same everywhere: give up
		if (failures.length === 0) return new Gemini("gemini-2.5-flash"); // one retry of the primary
		return new OpenAiLike("gpt-4o-mini"); // then degrade
	},
})
```

The function receives the raw error and a meta object: `currentModel` is the id that just failed and `failures` are the previous attempts, oldest first. Return the next target (a spec, a model id, a custom `AdkModel` or its DI class), or `undefined` to give up, which surfaces as `ModelsExhaustedError` carrying every failure. Returning the same model is a legitimate retry; a hard ceiling stops a policy that never gives up from running on your bill. The error stays raw because providers disagree on shapes; `httpStatusOf()` (from `@nestjs-adk/google`) reads the status from the SDK errors the built-in specs produce and answers `undefined` for shapes it does not know.

Three rules the executor enforces regardless of policy: a failure after the first chunk never fails over (part of the answer already reached the consumer), an aborted request never fails over, and the chain is flat: a target that declares failover of its own is refused at boot. Every switch is reported as a `model_rerouted` event, so failovers are never silent. Declaring `failover` on your `defaultModel` gives the whole app resilience in one place.

If the failover decision needs a service (a feature flag, provider health), build the spec in `forRootAsync`'s `useFactory` and capture the service in the closure: dependency injection enters where the spec is constructed, and the spec stays plain data.

### Restricting options per model

Some models reject parameters that their siblings accept (reasoning models often pin `temperature`). `createModelSpec` narrows a spec's options at compile time from a map you own, since the framework deliberately does not track per-model capabilities:

```ts
const MyGemini = createModelSpec(Gemini)<{
	"gemini-2.5-flash-lite": Omit<GeminiOptions, "temperature">;
}>();

new MyGemini("gemini-2.5-flash-lite", { temperature: 0.2 }); // compile error
new MyGemini("gemini-2.5-pro", { temperature: 0.2 }); // model outside the map → full options
```

It is type-only: at runtime `MyGemini` **is** `Gemini`, with zero extra behavior.

### Your own model (AdkModel)

When the framework does not know your provider (an internal proxy, a provider without an OpenAI-compatible API, a plain HTTP call), you implement the model yourself. A model is a provider like any other: extend `AdkModel`, implement `generate()` and reference the class in `@Agent({ model })` or as a failover target:

```ts
@Injectable()
export class ClaudeViaProxy extends AdkModel {
	readonly model = "claude-sonnet-5";

	constructor(private readonly http: ProxyClient) {
		super();
	}

	async *generate(request: ModelRequest, opts?: GenerateOptions): AsyncIterable<ModelResponse> {
		const stream = await this.http.stream(toClaude(request), { signal: opts?.signal });
		for await (const chunk of stream) {
			if (chunk.type === "text") yield { parts: [{ text: chunk.delta }] };
			if (chunk.type === "tool_use") yield { parts: [{ toolCall: { name: chunk.name, args: chunk.input } }] };
		}
		yield { usage: { promptTokens: stream.usage.in, outputTokens: stream.usage.out } };
	}
}
```

The `ModelRequest` arrives ready, with the composed instruction, conversation history and tool declarations, and you only translate it to your provider's wire format. On the way back the engine aggregates your chunks: every `text` part is a delta, `toolCall`s accumulate, `usage` and `finishReason` are last-one-wins. Tool calling, streaming, sessions, structured output and human approval work exactly as with the built-in specs. If you forget to register the class as a provider, the app fails at boot pointing at it.

Two contracts to respect. Instances are resolved once at boot and shared by every run, so keep the class a stateless singleton: `REQUEST`/`TRANSIENT` scopes are rejected at boot, and anything per-request belongs inside `generate()`, derived from the request. And honor `opts.signal` by stopping your upstream call when it fires; the engine stops consuming your chunks either way. Live (bidirectional audio/video) connections are not supported for custom models.

## Sessions

Pass a `sessionId` to `ask()` and the conversation becomes persistent. The agent remembers previous turns because the framework stores every event and replays the history into the model's context on each run. Without a `sessionId` the session is ephemeral and nothing is kept.

Storage goes through the `SessionStore` contract. The default implementation keeps everything in memory, which is perfect for development. For production you implement the contract with your own database and pass the class to `forRoot({ session })`. The store is the single source of truth: engines read from it and write to it, and never keep a private copy of the history.

## Validating the session state

The session state is a shared bag. Your code writes to it, tools write to it, and it can arrive from outside through a stored session. By default nothing checks those values, so a malformed value can travel all the way into your database layer. If you want a guarantee, declare a schema on the agent:

```ts
const reportState = z.object({ tenantId: z.string().min(1), count: z.number() });

@Agent({ name: "reporter", description: "Builds reports.", state: reportState, ... })
class ReporterAgent extends AdkAgent {}
```

From that moment the framework validates the declared keys at every border. When a run starts, the state coming from `ask()` and from the stored session is checked before any call to the model, so an invalid value fails fast with an `AgentStateInvalidError` and costs zero tokens. When a tool writes with `ctx.state.set`, the write is checked at that moment. Keys that the schema does not declare keep flowing freely, which matters for pipelines where one agent writes its output for the next one.

Inside a tool you can also demand a value instead of hoping it is there:

```ts
execute(input, ctx: ToolContext<z.infer<typeof reportState>>) {
	const tenantId = ctx.state.require("tenantId"); // typed as string, throws AgentStateMissingError if absent
}
```

The generic on `ToolContext` is an annotation you choose, because the same tool can serve many agents. Typing it gives you autocomplete and typed reads. If a tool serves two agents, annotate it with the union of the two state types and TypeScript will only let you touch the keys both agents share.

One note about errors: `AgentStateInvalidError` exposes the raw Zod issues in `error.issues`. Decide what your application logs, because in Zod v4 the issues can include the rejected value.

## Capping the loop

A lost model can call tools forever, and a broken tool can fail forever while the model retries. Both burn tokens. The framework ships two optional caps:

```ts
@Agent({ name: "reporter", maxIterations: 16, maxConsecutiveToolFailures: 2, ... })
```

`maxIterations` limits the model and tool round trips in a single run. Passing the cap aborts the run with an `AgentMaxIterationsError` that carries the aggregated token usage and the last requested tool, so you know what the loop cost before it died. `maxConsecutiveToolFailures` is a circuit breaker per tool: when the same tool fails that many times in a row the run aborts with a `ToolRepeatedFailureError`, without waiting for the bigger cap. A success resets the count.

Both are off unless you set them. You can define module wide defaults with `forRoot({ defaults: { maxIterations: 16 } })`, override them per agent in the decorator, and override both per call in `ask()`. The call wins over the agent, and the agent wins over the module. Because the per call override wins, build your `RunInput` in your own code and never from a raw external payload.

`maxInvalidArgs` follows the same resolution but is the one cap that is always on, defaulting to `2`. It counts how many times the model may call a tool with arguments the schema rejects: the first mistakes go back to the model as a result it can act on, and past the limit the run aborts with a `ToolInvalidArgsError`. Returning them rather than throwing is deliberate: the model wrote the argument and usually fixes it on the next call, while an exception would kill the run over a missing field. The cap exists because a schema the model cannot satisfy would otherwise retry on your bill forever. Set `maxInvalidArgs: 0` to abort on the first invalid call. It only counts for declared (`@Tool`) tools: a tool from an external catalog (MCP) carries the server's own JSON Schema, nothing rejects its arguments locally, and a bad call comes back from the server as a tool error the model reacts to.

These caps protect runs that go through `ask()`, `stream.ask()` and the runner. The `adk web` playground resolves agents through a different path and does not count iterations, which is fine because it is a development tool.

## Keeping the context small

Long conversations and big tool results eat your context window. The framework handles both cases for you.

When a tool returns a very large result, above 20 thousand characters, the framework stores the full content as an artifact and gives the model a short summary plus a `read_artifact` tool. The model can read the full content when it really needs it. You can turn this off for a specific tool with `offload: false`.

`read_artifact` works on anything in the `ArtifactStore`, not just offloaded results. Save an upload there and the model can pull it in on demand: text comes back as a normal result, binary comes back as [an attachment](#attachments). Which one you get follows the artifact's `encoding`; leave it unset and the mime type decides, since offloaded results are text and uploaded files are base64.

For long histories there is compaction. Configure a policy and old turns get summarized by an LLM when the history passes a token threshold:

```ts
context: contextPolicy({
	compaction: { maxTokens: 50_000, keepRecent: 5 },
})
```

You can set the policy globally in `forRoot` and override it per agent.

## Seeing the context

Most providers discount tokens whose prefix they have already seen. That discount depends on the beginning of your context staying byte-for-byte identical between calls, which is why the instruction is assembled from the stable parts to the volatile ones. A timestamp in the prompt or a tool catalog in shifting order breaks it silently: same answers, bigger bill.

Turn on diagnostics to capture what actually reaches the provider:

```ts
AdkModule.forRoot({ engine: GoogleAdkEngine, diagnostics: true })
```

With it on, every model call is captured as a `ContextSnapshot` split into `systemInstruction`, `toolDeclarations` and `contents`. The testing package turns those into assertions.

Keep it off in production. A snapshot holds the full prompt and the whole conversation, it is kept for as long as the `RunResult` lives, and a run that throws keeps its context attached to the `Error`, which is exactly the object crash reporters hang on to. The flag is opt-in and announces itself in the boot log for that reason; only the module can turn it on, so a `capture` field arriving in a request body does nothing.

You can also inspect the context without spending anything:

```ts
const snapshots = await app.get(AgentRunner).explain(SupportAgent, { message: "hi" });
```

`explain()` runs the real assembly pipeline (instruction, tool declarations, hydrated history) and stops right before the provider call. It is a debugging tool: it returns the system prompt and, given a `sessionId`, that session's conversation in plain text. Do not put it behind an endpoint that reaches end users.

## Human approval

Some actions should not run without a person saying yes. The tool declares what it does to the world, with `effect`:

```ts
@Tool({ name: "refund", description: "Refunds an order.", schema, effect: "destructive" })
```

The scale is ordered: `read` (only observes), `write` (changes state the same API can undo) and `destructive` (no undo: deleting, but also sending an email or charging a card). A tool that does not declare an `effect` counts as `write`. Tools that arrive from a source (MCP) carry their own effect, derived from the server's annotations; an unannotated one counts as `destructive`.

What pauses is policy, decided per run. The value reads as "from this level up, pause":

```ts
// default: read and write run on their own, destructive pauses
await agent.ask({ message });

// stricter: only read runs on its own; write and destructive pause
await agent.ask({ message, approval: "write" });

// nothing pauses in this run
await agent.ask({ message, approval: "none" });
```

The module can set a different default with `forRoot({ defaults: { approval: "write" } })`; the call wins over the module. Because the per call value wins, build your `RunInput` in your own code and never from a raw external payload: an `approval: "none"` that arrives from outside is exactly the kind of input this policy exists to stop.

When the model calls a tool at or above the policy's level, the tool does not execute. The run pauses and returns `status: "pending_approval"` with the pending call id. Your application shows this to a human, and then:

```ts
await agent.approve({ sessionId, callId }); // executes the tool and resumes the run
await agent.reject({ sessionId, callId, reason }); // skips the tool and tells the model why
```

Both calls return a normal run result, so the conversation continues naturally after the decision. The resumed turn also exists in streaming form, under the same namespace as everything else:

```ts
for await (const event of agent.stream.approve({ sessionId, callId })) { /* ... */ }
```

The first event of an approval, in both flavors, is a `tool_result` carrying the ORIGINAL `callId` and the executed tool's real result (in `RunResult.events` too). That is what lets your UI replace the row it drew as "awaiting approval" instead of showing it forever, and it arrives in band: the events after it are the resumed run, streaming like any other turn, through the same billing and persistence path.

A paused tool that came from a source needs `sources` on `approve()` again, the same way `ask()` received them: the library keeps no credentials and the original connection is closed, so whoever resumes reopens the source.

An approval can be answered minutes or days later, in another process, so the run's state is frozen with the pending action and restored on `approve()`. It has to be: the `state` you pass to `ask()` is per call and never persisted (only what a tool writes during the run is), so without freezing it a tool holding for permission would resume with no scope, and act with no owner. The frozen state layers under whatever the session learned since, and rides along into the rest of the resumed turn.

It is persisted with the pending action, in your `SessionStore`, so keep credentials out of `state` if that is not somewhere they belong. `ctx.attributes` is never persisted and never frozen, which cuts both ways: a secret passed there does not reach your store, and it does not reach the approved call either. Fetch short-lived credentials inside the tool rather than carrying them across the pause.

## Structured output

When you need data instead of prose, declare an output schema:

```ts
@Agent({ name: "reporter", description: "Builds reports.", output: reportSchema, outputKey: "report" })
class ReporterAgent extends AdkAgent<typeof reportSchema> {}

const run = await reporter.ask({ message });
run.output; // typed and validated
```

The result is parsed and validated with the schema. If the model produces something that does not match, you get an `OutputValidationError` instead of silently wrong data. The optional `outputKey` also writes the validated output into the session state, which is useful to pass data between agents in a pipeline.

## Sub-agents and workflows

An agent can delegate to other agents. With `subAgents: [OtherAgent]` the model itself decides when to transfer the conversation. When you want deterministic control instead, declare a workflow:

```ts
@WorkflowAgent({ name: "etl", mode: "sequential", agents: [ExtractAgent, SummarizeAgent] })
class EtlWorkflow extends AdkWorkflow {}
```

Modes are `sequential`, `parallel` and `loop`. A workflow is also an agent: you inject the class and call `ask()` or `stream.ask()` on the instance, exactly like before.

## Streaming, events and errors

`stream.ask()` yields a normalized event loop: `run_start`, `tool_call`, `tool_result`, `llm_response`, `agent_transfer`, `model_rerouted`, `approval_required` and `final`. Every event carries a `raw` field with the original payload from the provider, so no information is lost. `ask()` consumes the same loop and aggregates it into a `RunResult` with `text`, `usage`, `events`, `status`, `cost` when pricing is configured, and, when declared, `output`.

Errors are not events. They throw as typed classes that extend `AdkError` and carry a `code`. Configuration problems throw at startup and point at the class that caused them. Runtime problems throw classes like `AiEmptyResponseError`, `OutputValidationError`, `ToolExecutionError`, `ModelsExhaustedError`, `AgentStateInvalidError` and `AgentMaxIterationsError`, so you can catch exactly what you care about.

### Token streaming

By default the model answers per turn: one `llm_response` when the turn completes. To push text to a UI as it is produced, turn streaming on:

```ts
AdkModule.forRoot({ engine: GoogleAdkEngine, streaming: true })
```

Or per call, which overrides the module setting: `agent.stream.ask({ message, streaming: true })`.

With it on, the same turn also emits incremental `llm_response` events flagged `partial: true`. The provider still sends the aggregated response at the end, so **appending every `llm_response.text` would duplicate the answer**.

Consuming only the partials is the other trap, and the quieter one: with streaming off, or with the provider falling back to a non-streaming path mid-run, no partial ever arrives and the user is left staring at nothing. Treat the aggregated response as a fallback rather than as noise: hold it, and use it only if the turn produced no partials:

```ts
let streamed = false;
let aggregated = "";

for await (const event of agent.stream.ask({ message: "where is my order?" })) {
	if (event.type !== "llm_response") continue;
	if (event.partial) {
		streamed = true;
		process.stdout.write(event.text ?? "");
	} else {
		aggregated = event.text ?? "";
	}
}

if (!streamed) process.stdout.write(aggregated); // streaming off, or provider fell back
```

To exercise both paths in tests, the `deltas([...])` turn of `ScriptedEngine` emits the partials and the aggregated response exactly as a provider does. Asserting against an engine that emits only one of the two proves nothing about either bug.

`ask()` is unaffected either way: it aggregates the turn and returns the complete text. Token counts are reported once, on the turn's final response, so streaming does not change `usage` or `cost`.

## Logs

Turn on run logs in the module:

```ts
AdkModule.forRoot({ engine: GoogleAdkEngine, logging: "debug" })
```

Logs go through the normal Nest `Logger` with the context `Adk:<agent_name>`. Levels are cumulative. `"info"` (or `true`) logs the start and the end of each run with duration and token usage. `"debug"` adds tool calls, tool results and transfers to sub-agents. `"verbose"` adds intermediate model responses and stops truncating payloads. Reroutes and approval pauses are always logged as warnings.

```
run start session=smoke-1 user=u1 message=What's the status of my order 123?
tool call lookup_order args={"orderId":"123"}
tool result lookup_order result={"id":"123","status":"shipped"}
run done in 1389ms text=Your order 123 has shipped. | tokens in=772 out=41 total=813
```

Token usage is also available programmatically on every result as `run.usage`. With pricing configured, the same line carries the run cost.

## Cost

Turn on pricing in the module and every run reports what it cost:

```ts
AdkModule.forRoot({ engine: GoogleAdkEngine, pricing: new LiteLLMPricingSource() })
```

```ts
const run = await support.ask({ message });
run.cost;
// { total: 0.000334, currency: "USD",
//   byModel: [{ model: "gemini-2.5-flash", calls: 2, usage: { promptTokens: 772, outputTokens: 41, totalTokens: 813 },
//               amount: 0.000334 }],
//   unpriced: [], catalogAsOf: "2026-07-25T04:12:00Z" }
```

Prices come from the community catalog that LiteLLM maintains. `LiteLLMPricingSource` fetches it, keeps only the token rates, stores it and revalidates every four hours, all at runtime, inside the lib, with no build step. Every model in the catalog stays loaded, so a model released yesterday is priced today.

Each call is billed under the model that actually served it, so a failover or a compaction summary lands on its own line in `byModel` instead of being attributed to the agent's declared model. Cached prompt tokens are discounted from the prompt and charged at the cache rate, and models whose price grows above a context threshold (Gemini 2.5 Pro doubles past 200k) switch band by the real token count of the call.

### Posting to a ledger

If these numbers go into a ledger rather than a dashboard, do not read `total` alone. Every `CallCost` carries a `breakdown` (`input`, `output` and `cached` as separate amounts, which is what a billing row usually wants as separate columns) plus the `rates` actually applied to that call, after bands and overrides:

```ts
const response = run.events.find((event) => event.type === "llm_response" && event.cost);
response.cost;
// { amount: 0.000334, currency: "USD",
//   breakdown: { input: 0.00023, output: 0.000104, cached: 0 },
//   rates: { input: 3e-7, output: 2.5e-6, cacheRead: 3e-8 } }
```

Token counts are integers and rates are per token, so a consumer doing decimal arithmetic can multiply them itself and never inherit our floating point, which matters if your ledger rounds down at ten decimal places and expects the parts to reconcile against the whole.

`ModelCost` aggregates the same breakdown per model. It deliberately carries no `rates`: calls with different prompt sizes can land in different context bands, so a single rate for the aggregate would be a fiction. Rates are per call, where they are unambiguous.

One more thing worth planning for: `byModel` is a list. A turn that failed over touches two models, so a schema with one model name per transaction has no room for it.

Nothing is ever guessed. A model the catalog does not know, or one with an incomplete price, is named in `unpriced` and left out of the total: you get tokens without cost instead of a number that looks right and is not. The same applies before the first successful fetch: the run completes normally with `run.cost` absent.

```ts
new LiteLLMPricingSource({
	storage: new RedisPricingStorage({ client: redis }), // or FileSystemPricingStorage
	refreshEvery: 4 * 60 * 60 * 1000,
	overrides: {
		"internal-proxy-gpt": { inputPerMTok: 0.5, outputPerMTok: 1.5 },
		"gemini-2.5-flash": { inputPerMTok: 0.24 }, // contract discount, keeps the catalog's output price
	},
})
```

Storage is not about saving memory (the whole catalog is ~0.33 MB): it is what makes a restart skip the download, lets replicas share a single fetch, and keeps prices available offline. The default is in-memory, per process.

The catalog in memory is only ever replaced by a new and valid payload. A failed fetch, a timeout or an unexpected format logs an error and keeps the prices already loaded, so pricing never interrupts a run and never blocks boot. Because of that, the data can be stale: `catalogAsOf` tells you how old it is.

One trust assumption comes with that convenience: by default the prices are community data, read at runtime from a mutable branch, so whatever upstream publishes becomes your cost numbers within four hours. Point `url` at a commit SHA when you need reproducible figures, and use `overrides` for any price you must guarantee: an override always wins, including above the context thresholds.

## Embeddings

The core ships an `AdkEmbedder` contract with no default implementation, so you bring the provider you prefer:

```ts
@Embedder({ model: "gemini-embedding-001", dimensions: 3072 })
export class GeminiEmbedder extends AdkEmbedder {
	protected async generate(texts: string[]): Promise<EmbeddingOutput> {
		// call your provider, return vectors and the tokens it reported
	}
}
```

Configure it once with `forRoot({ embedder })` and inject `AdkEmbedder` wherever you need vectors, for semantic search or deduplication. You implement `generate()`; the base class exposes `embed()`, which prices the call against the configured `PricingSource` and returns `cost` alongside the vectors. Embeddings only bill input, so the model id on the decorator plus the reported tokens is all it takes. When the provider does not report tokens, `usage.promptTokens` is absent and the call goes unpriced instead of being counted as free.

The `Similarity` provider offers cosine similarity, and the testing package uses the same embedder for semantic assertions.

## Testing

Testing deserves its own package. [`@nestjs-adk/testing`](https://www.npmjs.com/package/@nestjs-adk/testing) gives you a scripted fake LLM, stackable mocks over the real agent instance, Vitest matchers and an LLM-as-judge helper. Your test setup stays plain `@nestjs/testing`.

## Learn more

The full project, with a working playground app and real AI smoke tests, lives at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).

## About this project

A disclaimer worth putting in writing: this library was built largely with [Claude Code](https://claude.com/claude-code). Most of the code you are reading was written by an AI, directed and reviewed by a human.

It exists because of real problems. Across Google ADK, Cline ADK and agents wired by hand, I kept solving the same things from scratch: the run loop, cost accounting, how a tool is declared, how MCP servers are registered, how the context is kept under control, where prompts live, how skills become a first-class tool, and how a run reports what it is doing. nestjs-adk is that pile of problems turned into one set of conventions, inside a framework I already trust.

So even though the core is mostly AI-written, the pieces I believe a good ADK must have are already in place. The current phase is not about new surface area: it is fixing bugs, raising the quality of the code, improving performance and sharpening DX.

DX is what drives every decision here. The clearer this library is to an AI reading it, the faster anyone ships good agents with it, and that is the whole bet. It also means breaking changes: expect several major releases, each one following semver strictly, whenever a change makes the framework easier to understand.

This is not an attempt to compete with Google ADK or Cline ADK. The goal is narrower: an agent toolkit that feels native to NestJS, on top of the engines that already do the heavy lifting.

If you are an experienced developer, open the code and tell me where it is wrong. Issues and PRs about design, naming, patterns and the conventions that should guide maintenance are the most valuable contribution this project can get.
