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
```

Two of them deserve a note. `toHaveUsedAtMostTokens` turns your token budget into a regression test, so a prompt change that doubles your cost fails CI. And `toBeSemanticallySimilarTo` compares meaning instead of exact text, using the embedder configured in your module:

```ts
await expect(run).toBeSemanticallySimilarTo("Your order has shipped.", { threshold: 0.85 });
```

You can also snapshot the exact instruction the model received, which catches accidental prompt changes:

```ts
expect(weatherAgent.lastInstruction()).toMatchSnapshot();
```

## Testing with the real engine

Sometimes you want to test the real engine loop with a scripted LLM. Use the real engine in the module and wrap the agent the same way. `TestAgent` registers a `ScriptedModel` as that agent's model override, so the native loop runs for real while the model follows your script.

## Judging real outputs

For tests that talk to a real model, exact assertions do not work. The judge helper asks another LLM to evaluate the answer against a rubric:

```ts
await expectJudged(run.text).toSatisfy("Explains that the order has shipped and stays polite", { judge });
```

## Learn more

The full documentation lives in [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core) and in the repository at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).
