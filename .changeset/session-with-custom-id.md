---
"@nestjs-adk/core": major
---

An application can open a conversation under an identifier it already owns.

Until now the runtime insisted on naming every conversation: a session was born inside an `ask` that carried no `sessionId`, and the id came back on the result. An application whose chat row is the conversation had two ways around that, and both are bookkeeping: ask a question first and write the returned id onto the chat, or keep a mapping between the two. `agent.createSession({ sessionId, owner })` removes the detour.

```ts
const chat = await this.chats.create({ userId: user.id });
await support.createSession({ sessionId: chat.id, owner: user.email });

await support.ask("where is my order?", chat.id);
```

Asking is deliberately unchanged. A question naming a conversation nobody opened is still refused with `SessionNotFoundError`, because the alternative is that a stale or mistyped id quietly becomes a second conversation instead of failing. Opening is a thing a caller asks for, never something inferred from an id the storage did not recognize.

An id that already names a conversation is refused with `SessionAlreadyExistsError`, and the existing one is untouched. Existence is not checked before the write: two requests opening the same chat is the ordinary case, and a read followed by a write loses that race by construction, so the answer comes from the storage inside its own transaction.

`createSession` writes the head and nothing else. The journal still begins with the first question, since every event carries the run that produced it and a conversation opened outside a run has none to carry. Which run records the beginning is now decided by looking at the journal rather than by remembering who wrote the head, and that also fixes a case that was already broken: a first question that created a session and then failed before committing left a conversation that could never record its own beginning.

`ask`, `stream` and `explain` now take a session id as plain text in their shorthand argument, not only as a parsed `SessionId`. The id an application holds is text, read off a chat row, and every other verb already accepted it that way: `ask(message, chat.id)` used to fall through to the options branch, where a string has no `sessionId`, and quietly opened a second conversation instead of continuing the one it named.

Reading a conversation by id comes in the two usual shapes, and both answer the head alone rather than replaying the journal:

```ts
const maybe = await support.findSessionById(chat.id); // Session | undefined
const session = await support.findSessionByIdOrFail(chat.id); // throws SessionNotFoundError
```

**Breaking:** `RuntimeServices.sessions` is now a `SessionService` carrying `create`, `inspect`, `find` and `findOrFail`, so `runtime.sessions.handle(id)` is `runtime.sessions.inspect(id)`. It reaches only code that embeds the runtime through `AdkRuntimeHost` without NestJS. Everything an application writes against an agent is additive: no existing signature changed.
