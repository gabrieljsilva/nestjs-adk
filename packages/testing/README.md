# @nestjs-adk/testing

Testing utilities for [`@nestjs-adk/core`](https://www.npmjs.com/package/@nestjs-adk/core). Setup is plain `@nestjs/testing`; this package only adds what is exclusive to agents.

```ts
import "@nestjs-adk/testing/matchers";

const weatherAgent = new TestAgent(module, WeatherAgent); // handle over the REAL instance
weatherAgent
	.mockCallTool("get_weather", { city: "SP" }) // stacks — nothing executes
	.mockText("It's 25°C in São Paulo.");        // next run consumes the stack (real tools via DI)

const run = await module.get(ForecastService).forecast("SP");

expect(run).toHaveCalledTool("get_weather", { city: "SP" });
expect(run).toHaveUsedAtMostTokens(1500);
await expect(run).toBeSemanticallySimilarTo("Your order has shipped.");
```

Includes: `TestAgent` (stackable mocks over `ScriptedEngine` or the real engine with `ScriptedModel`), Vitest matchers (tool calls, HITL pauses, token budgets, structured output, semantic similarity via your module's embedder) and an LLM-as-judge helper (`expectJudged`).

Full documentation: [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk)
