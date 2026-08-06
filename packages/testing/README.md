# @nestjs-adk/testing

Testing utilities for [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core) agents.

Testing agents is hard because the model is not deterministic. This package solves that with scripting: you tell the fake model exactly what to do, and everything else in your app runs for real, with real dependency injection and real tools. Your setup stays plain `@nestjs/testing`; this package only adds what is specific to agents.

```bash
npm i -D @nestjs-adk/testing
```

## Scripting an agent

Build your testing module as usual, with `ScriptedEngine` as the engine. Then wrap the agent you want to script in a `TestAgent`:

```ts
import { AdkModule, ScriptedEngine } from "@nestjs-adk/core";
import { TestAgent } from "@nestjs-adk/testing";

const module = await Test.createTestingModule({
	imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test-model" })],
	providers: [WeatherAgent, GetWeatherTool, WeatherService, ForecastService],
})
	.overrideProvider(WeatherService).useValue(fakeWeather) // Nest's native override
	.compile();

const weatherAgent = new TestAgent(module, WeatherAgent);
```

Mock calls stack turns for the next run. Nothing executes until the run happens:

```ts
weatherAgent
	.mockCallTool("get_weather", { city: "SP" })
	.mockText("It's 25°C in São Paulo.");

const run = await module.get(ForecastService).forecast("SP");
```

Notice the run was triggered by your own service, not by the test handle. That is the point: you test your real code path, and the script is consumed by whoever runs the agent next. When the scripted model says "call get_weather", the real tool executes through dependency injection, which proves your wiring works. There is also `mockFail(message)` to simulate provider errors, useful for testing failover.

## Matchers

Import the matchers once in your test setup file:

```ts
import "@nestjs-adk/testing/matchers";
```

Then assert directly on the run result:

```ts
expect(run).toHaveCalledTool("get_weather", { city: "SP" });
expect(run).toHaveCalledToolTimes("get_weather", 1);
expect(run).toHaveCalledToolsInOrder(["get_weather"]);
expect(run).toHavePausedForApproval("refund");
expect(run).toHaveUsedAtMostTokens(1500);
expect(run).toMatchOutput(reportSchema);
expect([runA, runB]).toHaveStablePrefix(0.85);
expect([warmUp, runA, runB]).toHaveCacheHitRatioAbove(0.6);
```

Two of them deserve a note. `toHaveUsedAtMostTokens` turns your token budget into a regression test, so a prompt change that doubles your cost fails CI. And `toBeSemanticallySimilarTo` compares meaning instead of exact text, using the embedder configured in your module:

```ts
await expect(run).toBeSemanticallySimilarTo("Your order has shipped.", { threshold: 0.85 });
```

You can also snapshot the exact instruction the model received, which catches accidental prompt changes:

```ts
expect(weatherAgent.lastInstruction()).toMatchSnapshot();
```

## Cache diagnostics

Once your agent answers well, the next question is what it costs. The biggest lever is prefix caching: providers discount tokens whose prefix they already saw, and that only works while the start of your context stays byte-for-byte identical between calls. A `Date.now()` in the prompt or a tool catalog in shifting order kills the discount without changing a single answer.

Enable capture with `AdkModule.forRoot({ diagnostics: true })`, then assert on it. Two tools, different price tags.

**Stable Prefix** is deterministic, runs on the scripted model and belongs in your normal suite. Run the agent with different inputs and check how much of the context held still:

```ts
const runA = await agent.ask({ message: "what is my balance?" });
const runB = await agent.ask({ message: "I want to cancel my account" });

expect([runA, runB]).toHaveStablePrefix(0.85);
```

There is no default threshold on purpose: the instruction-to-history proportion changes too much between agents for a universal number to mean anything. When it fails, the message points at the segment and the exact text where the contexts parted ways, so you find the volatile value instead of guessing.

**Cache Hit Ratio** talks to the real provider and measures what actually happened. Keep it in `*.ai.spec.ts`, which the `agents` project runs on demand and `npm test` leaves alone:

```ts
const warmUp = await agent.ask({ message: "hi" });
const runA = await agent.ask({ message: "and my last order?" });
const runB = await agent.ask({ message: "when does it arrive?" });

expect([warmUp, runA, runB]).toHaveCacheHitRatioAbove(0.6);
```

The first run is dropped from the calculation, since implicit caching only exists after somebody paid for the prefix. A run the provider said nothing about leaves the sample entirely, numerator and denominator, since keeping its prompt tokens would quietly assume "zero cached" and drag the ratio down for a run that was never measured. `CacheReport` reports both counts: `sampledRuns` fed the ratio, `silentRuns` were set aside. If nothing was reported at all, the matcher throws saying the metric is unavailable, never `0%`, which would send you hunting a bug that is not there.

Implicit caching is best-effort, so expect variance between runs of the suite: it takes a few calls to engage and expires on its own schedule. That is why the assertion is a floor and never an equality.

The two answer different questions. Stable Prefix measures what you control and costs nothing. Cache Hit Ratio measures what the infrastructure delivers and costs real money, so it runs in a cadence of its own rather than on every commit. A high prefix with a low real ratio is useful information: your prompt is fine, look elsewhere.

One thing the library deliberately does not check: providers only engage caching above a minimum prefix size, which varies by model. Agent prompts with skills usually clear it comfortably, and hardcoding those thresholds would mean shipping data that goes stale.

## Testing with the real engine

Sometimes you want to test the real engine loop with a scripted LLM. Use the real engine in the module and wrap the agent the same way. `TestAgent` registers a `ScriptedModel` as that agent's model override, so the native loop runs for real while the model follows your script.

## Judging real outputs

For tests that talk to a real model, exact assertions do not work. The judge helper asks another LLM to evaluate the answer against a rubric:

```ts
await expectJudged(run.text).toSatisfy("Explains that the order has shipped and stays polite", { judge });
```

## Learn more

The full documentation lives in [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core) and in the repository at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).
