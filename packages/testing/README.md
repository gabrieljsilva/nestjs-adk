# @nestjs-adk/testing

Utilitários de teste do [nestjs-adk](../../README.md): `AdkTestModule.forAgent` (grafo do agente auto-registrado), `scriptedModel`/`callTool`/`text`/`fail` (LLM roteirizado rodando no loop REAL do engine), matchers Vitest (`toHaveCalledTool`, `toHaveCalledToolTimes`, `toHaveCalledToolsInOrder`) e LLM-as-judge (`expectJudged`).

```ts
import "@nestjs-adk/testing/matchers";

const t = await AdkTestModule.forAgent(WeatherAgent, { model: scriptedModel([callTool("get_weather", { city: "SP" }), text("25°C")]) });
const run = await t.ref.ask({ message: "clima em SP?" });
expect(run).toHaveCalledTool("get_weather", { city: "SP" });
```
