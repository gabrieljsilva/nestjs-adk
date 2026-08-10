---
"@nestjs-adk/core": minor
---

`AdkModule.forRootAsync` builds the module's options inside the container.

`forRoot` takes a value, which is enough while every option is one. Most of what an application eventually plugs in is not: a storage holding a database client, an embedder that needs credentials, a pricing source with an HTTP client, an approval policy that reads the current tenant. None of those can be named where the module is declared, because none of them exist yet, and the only way out was a wrapper module that spread the library's `forRoot` and overrode `ADK_OPTIONS`. That works, and it should never have been anyone's job: it is a module that exists to route around the library, resting on a token that was never promised to keep meaning what it means.

```ts
AdkModule.forRootAsync({ imports: [InfraModule], useClass: AdkOptions });
```

`useClass` is the form to reach for, and the reason is types. A factory declares its dependencies in an `inject` array TypeScript cannot line up with the parameters that receive it, so two entries swapped compile and fail at boot; a class declares them in a constructor NestJS resolves and TypeScript checks like any other provider's. `AdkOptionsFactory` is the interface it implements, `useExisting` points at an instance another module already provides, and `useFactory` with `inject` is there for the cases that want it.

Declaring none of the three is refused, and so is declaring two: the second would be configuration nothing reads. Both fail where `forRootAsync` is called rather than during the boot they would otherwise poison, and they carry `ASYNC_OPTIONS_NOT_DECLARED` and `CONFLICTING_ASYNC_OPTIONS`.

Nothing else in the module changed. Every provider already read the options through `ADK_OPTIONS` instead of capturing them, so both entry points differ in one provider and the runtime is composed in the same lifecycle hook either way. `forRoot` is untouched, and an application using it has nothing to do.
