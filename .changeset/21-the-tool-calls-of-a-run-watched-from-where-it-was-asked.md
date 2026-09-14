---
"@nestjs-adk/core": minor
---

The tool calls of a run can be watched by whoever asked the question, and a prompt built per run knows who is asking.

## `toolCalls` in `AskOptions` and `DecisionOptions`

A run announces its tool calls through the journal, and a `SessionEventConsumer` is how something outside the run reads that. What the code that asked the question had was less: `stream` yields what the model said, and the runtime's tool lifecycle (which tool, with what effect, held for a decision or not, and what it answered) reached it only by registering a global consumer at module boot, keying a map by session id to find the caller, and re-typing a payload the runtime had already typed.

`ToolCallObserver` is the other side. It travels with the call, lives as long as the call does, and is told twice per tool call:

```ts
class ToolCards extends ToolCallObserver {
	public async requested(call: ToolCallNotice): Promise<void> {
		await this.cards.draw(call.callId, call.tool?.description, call.effect, call.isHeld);
	}

	public async settled(result: ToolResultNotice): Promise<void> {
		await this.cards.finish(result.callId, result.output, result.isRefused ? result.reason : undefined);
	}
}

const run = support.stream(message, { sessionId, actor, toolCalls: new ToolCards(cards) });
```

`requested` arrives after the gate has screened the turn and before anything of it runs, with the `ToolDefinition` the call named and `isHeld` as the gate decided it. That verdict is the point: an application that showed a button on a held call used to ask the approval policy a second time, from outside the run, and two answers to one security question is one too many. `settled` follows each result, whether the tool answered, failed, or was refused by the person asked, and `ToolResultNotice.isRefused` tells the last two apart.

A held call is requested once, in the run that suspended, and settles in the run that released it, which is why `approve` and `reject` take an observer too. Nothing about it is stored: a decision made minutes later, on another instance, brings its own, and the turn it releases was in the journal all along.

`requested` is awaited before the turn runs, so an observer that writes a row for a call has written it by the time the result arrives. An observer that throws ends the run, the way any other failure in the caller's own code would; a delegated child tells the parent's observer nothing, the way its chunks reach nobody.

`ToolOutcome` is exported, since a `ToolResultNotice` carries one.

## `PromptContext.actor`

`prompt()` received the session's owner and not the caller's actor, so a prompt that names a workspace or a role had to keep the actor's claims in a map keyed by session id, filled before `ask` and emptied after. The actor is now on the context, the same one every tool of the run receives, so what the instruction says and what the tools may do read the same claims.

```ts
protected override async prompt(context: PromptContext): Promise<string> {
	return this.prompting.renderFromFileOrFail("assistant.md", {
		workspaceId: context.actor?.claims.workspaceId,
	});
}
```

The owner stays what it was: whose conversation this is, remembered by the session. The actor is who is asking now.
