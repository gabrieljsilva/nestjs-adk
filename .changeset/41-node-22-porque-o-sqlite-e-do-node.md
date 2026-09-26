---
"@nestjs-adk/core": patch
"@nestjs-adk/google": patch
"@nestjs-adk/mcp": patch
"@nestjs-adk/openai": patch
"@nestjs-adk/testing": patch
---

O Node mínimo passa a ser 22.5.0, que é a versão real exigida

`node:sqlite` entrou no Node em 22.5.0. O core importa esse módulo no
adapter de SQLite e o exporta no barrel, então `import` de
`@nestjs-adk/core` em Node 20 estoura com `No such built-in module:
node:sqlite`. Os manifestos declaravam `>=20`, ou seja, o npm aprovava a
instalação e a quebra aparecia depois, no primeiro import, longe da causa.

Os cinco pacotes passam a declarar `>=22.5.0`, e o `.nvmrc` acompanha com
`22`. O CI lia o `.nvmrc` pelo `setup-node` e rodava em Node 20: 64 dos
430 arquivos de teste falhavam por isso, todos os que alcançam o adapter.
