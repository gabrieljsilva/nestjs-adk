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

`ask()` runs the agent and returns the final result. `stream()` gives you the events one by one while the agent works. Later in this document you will also meet `approve()` and `reject()`, used for human approval.

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

The `model` field on `@Agent` and the `defaultModel` on `forRoot` accept a string or a model spec class. Specs are small objects that only carry configuration. The engine turns them into real clients:

```ts
model: "gemini-2.5-flash"

model: new Gemini("gemini-2.5-flash", { labels, cache: { content }, config })

model: new OpenAiLike("gpt-4o-mini", { baseUrl, apiKeyEnv })

model: new ModelRouter({
	targets: {
		primary: new Gemini("gemini-2.5-flash"),
		fallback: new OpenAiLike("gpt-4o-mini", { baseUrl: "https://openrouter.ai/api/v1" }),
	},
})
```

`OpenAiLike` covers every provider that speaks the OpenAI API, which includes OpenAI itself, OpenRouter, Ollama and many others. `Gemini` lives in `@nestjs-adk/google` and adds Vertex AI options, billing labels and explicit content caching.

`ModelRouter` gives you failover in one line. When the current target fails before the first chunk of the response, for example with a 429, the router moves to the next target in the declared order. Every switch is reported as a `model_rerouted` event, so failovers are never silent. If you use a router as your `defaultModel`, you get global failover for the whole app.

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

These caps protect runs that go through `ask()`, `stream()` and the runner. The `adk web` playground resolves agents through a different path and does not count iterations, which is fine because it is a development tool.

## Keeping the context small

Long conversations and big tool results eat your context window. The framework handles both cases for you.

When a tool returns a very large result, above 20 thousand characters, the framework stores the full content as an artifact and gives the model a short summary plus a `read_artifact` tool. The model can read the full content when it really needs it. You can turn this off for a specific tool with `offload: false`.

For long histories there is compaction. Configure a policy and old turns get summarized by an LLM when the history passes a token threshold:

```ts
context: contextPolicy({
	compaction: { maxTokens: 50_000, keepRecent: 5 },
})
```

You can set the policy globally in `forRoot` and override it per agent.

## Human approval

Some actions should not run without a person saying yes. Mark the tool:

```ts
@Tool({ name: "refund", description: "Refunds an order.", schema, requiresApproval: true })
```

`requiresApproval` also accepts a function of the input and the context, so you can require approval only above a value, for example.

When the model calls a tool that requires approval, the tool does not execute. The run pauses and returns `status: "pending_approval"` with the pending call id. Your application shows this to a human, and then:

```ts
await agent.approve({ sessionId, callId }); // executes the tool and resumes the run
await agent.reject({ sessionId, callId, reason }); // skips the tool and tells the model why
```

Both calls return a normal run result, so the conversation continues naturally after the decision.

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

Modes are `sequential`, `parallel` and `loop`. A workflow is also an agent: you inject the class and call `ask()` or `stream()` on the instance, exactly like before.

## Streaming, events and errors

`stream()` yields a normalized event loop: `run_start`, `tool_call`, `tool_result`, `llm_response`, `model_rerouted`, `approval_required` and `final`. Every event carries a `raw` field with the original payload from the provider, so no information is lost. `ask()` consumes the same loop and aggregates it into a `RunResult` with `text`, `usage`, `events`, `status` and, when declared, `output`.

Errors are not events. They throw as typed classes that extend `AdkError` and carry a `code`. Configuration problems throw at startup and point at the class that caused them. Runtime problems throw classes like `AiEmptyResponseError`, `OutputValidationError`, `ToolExecutionError`, `ModelsExhaustedError`, `AgentStateInvalidError` and `AgentMaxIterationsError`, so you can catch exactly what you care about.

## Logs

Turn on run logs in the module:

```ts
AdkModule.forRoot({ engine: GoogleAdkEngine, logging: "debug" })
```

Logs go through the normal Nest `Logger` with the context `Adk:<agent_name>`. Levels are cumulative. `"info"` (or `true`) logs the start and the end of each run with duration and token usage. `"debug"` adds tool calls and tool results. `"verbose"` adds intermediate model responses and stops truncating payloads. Reroutes and approval pauses are always logged as warnings.

```
run start session=smoke-1 user=u1 message=What's the status of my order 123?
tool call lookup_order args={"orderId":"123"}
tool result lookup_order result={"id":"123","status":"shipped"}
run done in 1389ms text=Your order 123 has shipped. | tokens in=772 out=41 total=813
```

Token usage is also available programmatically on every result as `run.usage`.

## Embeddings

The core ships an `Embedder` contract with no default implementation, so you bring the provider you prefer. Configure it once with `forRoot({ embedder })` and inject `Embedder` wherever you need vectors, for semantic search or deduplication. The `Similarity` provider offers cosine similarity, and the testing package uses the same embedder for semantic assertions.

## Testing

Testing deserves its own package. [`@nestjs-adk/testing`](https://www.npmjs.com/package/@nestjs-adk/testing) gives you a scripted fake LLM, stackable mocks over the real agent instance, Vitest matchers and an LLM-as-judge helper. Your test setup stays plain `@nestjs/testing`.

## Learn more

The full project, with a working playground app and real AI smoke tests, lives at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).
