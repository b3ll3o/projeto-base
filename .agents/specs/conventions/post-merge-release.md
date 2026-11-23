# Convenção: Release Automático do Template (Post-Merge Tagging)

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).
> pt-BR prose, English technical identifiers.

## Objetivo

Eliminar a etapa manual de taggear o template após cada bump de versão.
A versão canônica do template vive em 6 arquivos (footer + Histórico
de Versões) e não em `package.json`, então o versionamento
Changesets/semantic-release tradicional não se aplica — precisa de
workflow customizado.

## Trigger

O workflow [`.github/workflows/release-template.yml`](../../../.github/workflows/release-template.yml)
dispara em **duas** situações:

1. **`push` em `main` com mudança em `docs/MONOREPO.md`** (único arquivo
   onde a versão é detectada pelo regex). Os outros 5 arquivos versionados
   (`docs/STACK.md`, `docs/TEMPLATE_USAGE.md`, `AGENTS.md`, `README.md` e
   `.agents/specs/conventions/estrutura-e-versionamento.md`)
   **DEVEM** ser atualizados juntos para consistência mas **não disparam**
   o workflow — apenas `MONOREPO.md` é a fonte da verdade da tag.
2. **`workflow_dispatch` manual** — usado para backfill (ex: tag
   retroativa de uma versão que subiu antes do workflow existir).

## Como a versão é detectada

1. Preferência: input `version` do `workflow_dispatch` (se passado).
2. Fallback: regex no footer de `docs/MONOREPO.md`:
   ```
   \*\*Versão do documento:\*\* X.Y.Z
   ```
3. Validação: precisa casar `^[0-9]+\.[0-9]+\.[0-9]+$`.
4. Tag final: `vX.Y.Z` (prefixo `v` adicionado se ausente).

> **Nota:** O trigger `push em main` que detecta mudança em `docs/MONOREPO.md` é uma das 3 camadas da estratégia de defense-in-depth do CI (ver [ci-defense-in-depth.md](./ci-defense-in-depth.md)). O release workflow roda em camada 3 (quality CI gated).

## Idempotência

Antes de criar a tag, o workflow verifica `git rev-parse --verify --quiet
refs/tags/<tag>`. Se a tag já existe, o job é **noop** (skip silencioso).
Isso permite:

- Múltiplos pushes para `main` sem criar tags duplicadas.
- Re-rodar `workflow_dispatch` para a mesma versão sem erro.

## Backfill (como taggar versões antigas)

Para uma versão `X.Y.Z` que já está nos docs mas sem tag:

1. GitHub → Actions → release-template → Run workflow
2. Input `version`: `X.Y.Z` (sem `v`)
3. Run
4. Workflow lê a versão (input sobrescreve footer), valida formato,
   cria tag se não existir, push.

## Quem pode rodar

- **Push-trigger**: automático, qualquer merge em `main`.
- **`workflow_dispatch`**: qualquer contributor com permissão de
  `actions: write` no repo (default para maintainers).

## Permissões necessárias

- `contents: write` (criar tag + push).

Leitura de outputs de steps (`${{ steps.X.outputs.Y }}`) **não** requer
scope de token — é resolvido pelo runtime do Actions no contexto do job.

Workflow declara `permissions: { contents: write }` no escopo do job
para seguir princípio de menor privilégio.

## Mensagem da tag

Annotated tag com mensagem fixa:

```
vX.Y.Z — template release

Versão: X.Y.Z
Trigger: push | workflow_dispatch
Commit: <full SHA>

Tag criada automaticamente por .github/workflows/release-template.yml.
Para detalhes do que mudou, consulte o Histórico de Versões em
docs/MONOREPO.md, docs/STACK.md e
.agents/specs/conventions/estrutura-e-versionamento.md.
```

## Onde a versão canônica vive

| Arquivo | Linha/conteúdo |
|---|---|
| `docs/MONOREPO.md` | Footer `**Versão do documento:** X.Y.Z` |
| `docs/STACK.md` | Footer `**Versão da stack:** X.Y.Z` |
| `docs/TEMPLATE_USAGE.md` | Footer `**Versão do documento:** X.Y.Z` |
| `.agents/specs/conventions/estrutura-e-versionamento.md` | Histórico de Versões (linha por release) |
| `AGENTS.md` | Footer `**Versão do documento:** X.Y.Z` |
| `README.md` | Footer `**Versão:** X.Y.Z` |

Os **seis** arquivos DEVEM ter a mesma versão. Divergência entre eles é bug.

⚠️ A lista tem SEIS desde a v1.15.0 — e esta convenção dizia TRÊS (no
Objetivo) e QUATRO (aqui). A omissão do `docs/TEMPLATE_USAGE.md` era
exatamente a raiz do defeito que a #126 corrigiu: o arquivo que ficava de fora
era o do footer, e quem seguia esta PROCEDÊNCIA produzia a divergência que o
`check-version-footers` accuse no PR — sem pista de qual arquivo faltou. Os
`AGENTS.md` e o `README.md` entraram depois, e o drift JÁ TINHA ACONTECIDO:
o `AGENTS.md` foi para `1.13.0` no merge do #116 enquanto os quatro seguiam em
`1.12.0`, e **nenhum gate olhou** — o gate media só os quatro. A lista do gate
(`FOOTERS_DE_VERSAO`, em `.tooling/scripts/ci/check-version-footers.ts`) é a
que vale, e a spec dela prende a lista.

### A regra que fecha a classe do rodapé

Os seis footers dizem a **versão**; o gate também mede se o **rodapé** mudou
desde a última tag **sem** a versão acompanhar. MEDIDO no PR #172: o rodapé do
`README.md` passou de 47/49/17 para 48/50/18 e o rótulo continuou `1.30.0` —
que já era o da tag publicada. Dois conteúdos com o mesmo rótulo.

⚠️ O que se compara é o **rodapé** (a linha do rótulo), não o arquivo
inteiro. MEDIDO 2026-11-19: a versão que comparava o arquivo reprovava **25
de 72** commits do histórico — inclusive PRs já MERGED (#166 NestJS 12, #170
cards de empresa) cujo rodapé era byte-idêntico. O repositório muda prosa o
tempo todo (PR de feature + PR de release separado), e a regra do arquivo
inteiro transformava TODO PR que tocasse um dos seis num PR de release. A
prosa em volta não muda o que o rodapé nomeia.

A janela medida é a do **último release**: desde a tag, o rodapé mudou e a
versão não mudou em lugar nenhum. Um bump no meio da janela cobre a janela —
que é o caso normal do PR que bumpa e ajusta no mesmo diff. Quem muda o
**rodapé** de um dos seis **bumpa junto** (patch, conforme
[`estrutura-e-versionamento.md`](./estrutura-e-versionamento.md)).

O instrumento é o gate `check-version-footers` (3ª regra), e o dente está
registrado em [`ci-defense-in-depth-dentes.md`](./ci-defense-in-depth-dentes.md).


## Bump manual (fluxo de dev)

Para bumpar a versão (ex: 1.3.0 → 1.4.0):

1. Branch: `chore/bump-X.Y.Z` a partir de `main`.
2. Editar os **6 footers** (o `README.md` e o `AGENTS.md` inclusos) e adicionar
   a linha do novo release no Histórico dos 4 docs canônicos.
3. Commit conventional: `chore(template): bump version X.Y.Z → A.B.C`.
4. Push + PR.
5. Merge → workflow auto-tag `vA.B.C`.

Não precisa de step manual de tag.

## Limitações conhecidas

- **Versionamento não-standard**: a versão vive em markdown, não em
  `package.json`. Scripts/programas que parseiam `package.json` não
  verão a versão do template. Aceitável para o template porque a
  "versão de release" é um conceito de governança do padrão
  `.agents/`, não de um package npm.
- **Sem changelog automático**: a mensagem da tag aponta para o
  Histórico de Versões nos docs (humano deve consultar). Para
  changelog programático no futuro, considerar `.agents/CHANGELOG.md`
  gerado por script a partir dos Históricos.
- **Sem proteção contra force-push de tag**: depende de branch
  protection em `main` (já ativo). Se alguém deletar tag localmente
  e re-taggar com outro SHA, isso passa; convenção: nunca deletar
  tags de release após push.

## Histórico de Versões

| Versão | Mudanças |
|--------|----------|
| `1.0.0` | Workflow release-template (auto-tagging após bump em main) + backfill via `workflow_dispatch` |
