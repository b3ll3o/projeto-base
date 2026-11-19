---
name: openapi-doc-specialist-memory
description: Memória acumulada do agent openapi-doc-specialist — o openapi.json é artefato GERADO e versionado (24 paths, 30 operações); publicar ≠ auditar o contrato, que é do openapi-contract-specialist.
---

# Memória: `openapi-doc-specialist`

## Decisões Tomadas

### 2026-11-18 — "Publicado" é um estado verificável, não uma intenção

**Contexto:** o item 9 da matriz `kit-documentacao.md` §2.4 é do tipo
`artefato`: um arquivo **gerado** e **versionado**. O `docs/api/users.md`
diz que o artefato é "derivado e versionado (desde o #125)" e que o gate
`check-openapi-contract` compara a spec versionada com a gerada.

**Decisão:** o meu estado "publicado" tem **dois** predicados mecânicos:
(1) `git ls-files apps/api/openapi.json` devolve o caminho — está commitado;
(2) `pnpm --filter @projeto/api openapi:export` seguido de
`git diff --stat apps/api/openapi.json` não mostra diff — está fresco.
"Eu atualizei a documentação" sem esses dois predicados não é publicação:
o diff vazio é a evidência.

### 2026-11-18 — A fronteira com o `openapi-contract-specialist` é medição × publicação

**Contexto:** o `openapi-contract-specialist` já existe e é o dono da
**auditoria** do contrato (drift DTO↔Prisma, breaking change, cobertura de
decorators), com a skill `openapi-audit`. A matriz do kit me põe como dono
do item 9 — o que poderia virar duplicação.

**Decisão:** quem **mede** o contrato contra o código é o
`openapi-contract-specialist`. Quem garante que o **artefato publicado**
existe, está fresco e é consumível — e que `docs/api/*.md` é a versão
legível dele — sou eu. A fonte do contrato é o decorator `@Api*` do
controller, que é do `nestjs-specialist`.

**Consequências:** eu nunca edito o JSON à mão e nunca reporto drift de
DTO↔Prisma. Se o contrato está errado, o conserto é no decorator, e o
achado é do auditor de contrato.

### 2026-11-18 — O doc legível aponta, não copia

**Contexto:** `documentacao.md` §2 diz que o doc legível não é cópia do
gerado: "`docs/api/<bc>.md` é a *leitura* do contrato; o contrato é o
`@Api*`. O doc aponta para o contrato e explica o que ele não diz".

**Decisão:** o `docs/api/<bc>.md` mantém a tabela de endpoints e o porquê
(não 400 e não 422, o que o guard garante), mas **não** transcreve o JSON.
Por isso ele envelhece mais devagar que o artefato.

## Padrões Descobertos

- Estado medido em 2026-11-18: `node -e "const d=require('./apps/api/openapi.json');console.log(Object.keys(d.paths).length)"` → **24** paths;
  `...flatMap(p=>Object.keys(p).filter(k=>['get','post','put','patch','delete'].includes(k))).length)` → **30** operações.
  As chaves de topo: `openapi` (`3.0.0`), `paths`, `info`, `tags`,
  `servers`, `components` (`securitySchemes`, `schemas`).
- A matriz §2.4 exige as âncoras `"openapi"`, `"paths"`, `"components"` —
  o gate compara com `includes()`, então a chave precisa aparecer **com as
  aspas** no JSON.
- O comando de geração vive em `apps/api/package.json`:
  `"openapi:export": "node --import tsx/esm scripts/export-openapi.ts"`, e
  se invoca como `pnpm --filter @projeto/api openapi:export`.
- O `scripts/export-openapi.ts` monta o `AppModule` com `@nestjs/testing`
  (não `NestFactory.create`) e **sobrescreve o `PrismaService`** — o export
  não toca o banco, mas exige `JWT_SECRET` (o script injeta um valor
  descartável por desenho).
- `docs/api/users.md` já é o padrão da versão legível: "Medido em
  2026-11-17", contagem com o comando `node -e "..."` ao lado, e a
  ressalva de que a conferência da tabela é **manual**.

## Lições Aprendidas

- ❌ Versionar um `openapi.json` que ninguém regenera — o artefato vira
  contrato morto, e é pior que não ter: o leitor confia nele.
- ❌ Tratar "o contrato está errado" como achado meu — quem audita o
  contrato contra o código é o `openapi-contract-specialist`.
- ❌ Afirmar a contagem de paths sem o comando: o número envelhece a cada
  endpoint novo, e o gate não mede prose.

## Sugestões de Evolução

- [ ] Um gate que falhe quando `openapi:export` produz diff — hoje o
  `check-openapi-contract` compara, mas a pubblicação é humana.
- [ ] Um índice `docs/api/README.md` listando os BCs, para a item 9 ter
  índice quando a convenção exigir.
