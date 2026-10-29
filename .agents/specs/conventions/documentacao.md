---
name: documentacao
version: 1.0
updated: 2026-10-29
maintainer: documentation-specialist
description: "Convenção canônica da documentação da aplicação — a documentação é parte do código: uma unidade de código sem doc canônica é uma lacuna nomeada; um doc que afirma o que o código não faz é defeito P0. Define a matriz de cobertura (unidade → doc dono), a regra do fato único, o frescor verificável, e o gate executável que cobra os dois."
---

# Convenção: `documentacao`

> pt-BR: institui a **documentação como contrato do código**. Não é "boa
> prática" — é a mesma obligations de um schema de banco ou de um contrato
> HTTP: se o código muda e o doc não, o repo tem um bug.

## §1. O Princípio

> **A documentação é tão parte do código quanto o código.**

Três consequências práticas:

1. **Toda unidade de código tem uma doc canônica.** Não "tem documentação
   em algum lugar" — tem **um** lugar, declarado na matriz (§3).
2. **Doc que mente é defeito P0.** Pior que ausência: o leitor perde tempo
   num caminho que não existe. Ausência é P1 (lacuna); mentira é P0.
3. **Doc desatualizada é dívida com dono.** Ou é corrigida, ou a lacuna é
   **declarada** num lugar canônico com o motivo. Não existe lacuna
   silenciosa.

### O que isto **não** é

- Não é "escrever mais texto". Volume sem dono é ruído.
- Não é "documentar tudo". Documentar o óbvio (nome de arquivo, assinatura de
  função, o que o `git log` mostra) é custo sem retorno.
- Não é "documentar histórico". `docs/superpowers/plans/**` e
  `.agents/runs/**` são registro do que foi decidido numa data; envelhecer é
  a função deles.

## §2. O fato tem UM dono

Cada fato vive em **uma** representação canônica. Todo outro lugar
**referencia** (regra DRY — `dry.md`, gate `check-repeticao`).

| Dono canônico | O que ele é | Quem **não** duplica |
|---|---|---|
| `apps/api/src/modules/<bc>/` | a verdade do **comportamento** (o código) | o doc descreve; não reimplementa |
| `apps/api/prisma/schema.prisma` | a verdade do **modelo de dados** | `docs/api/<bc>.md` resume e **linka** |
| `packages/shared-types/src/` | a verdade do **contrato web↔api** | `docs/web/rotas.md` referencia |
| `@Api*` no controller | a verdade do **contrato HTTP** | `docs/api/<bc>.md` é a versão legível |
| `docs/como-rodar.md` | a verdade do **como executar** | README e `AGENTS.md` linkam |
| `docs/adr/NNNN-*.md` | a verdade do **porquê** | JSDoc e README **linkam** |
| `docs/STACK.md` | a verdade das **versões** | README e docs de módulo linkam |
| `docs/flows/<dominio>/<fluxo>/flow.md` | a verdade do **fluxo** (derivada da IR) | — |

> **O doc legível não é cópia do gerado.** `docs/api/<bc>.md` é a *leitura*
> do contrato; o contrato é o `@Api*`. O doc aponta para o contrato e
> explica o que ele não diz (por que 400 e não 422, o que o guard garante).

## §3. Matriz de cobertura — unidade → doc dono

> **Esta tabela é a fonte da verdade da cobertura.** O gate
> `check-doc-coverage` a mede mecanicamente. Mudar a tabela exige mudar o
> gate no mesmo PR — senão o gate mente sobre o que cobra.

| Unidade de código | Doc canônico | Quadrante |
|---|---|---|
| Módulo NestJS `apps/api/src/modules/<bc>/` | `docs/api/<bc>.md` | reference |
| Endpoint (método + path) | `docs/api/<bc>.md` §Endpoints | reference |
| Model Prisma | `schema.prisma` (`///`) + seção em `docs/api/<bc>.md` | reference |
| Rota Next.js `apps/web/app/<rota>/` | `docs/web/rotas.md` | reference |
| Export de `packages/shared-types` | `packages/shared-types/README.md` | reference |
| Variável de ambiente | `docs/como-rodar.md` §Variáveis | reference |
| Script `pnpm` | `docs/como-rodar.md` | how-to |
| Decisão arquitetural | `docs/adr/NNNN-<slug>.md` | explanation |
| Fluxo com IR | `docs/flows/<dominio>/<fluxo>/flow.md` | tutorial |
| Regra de processo | `.agents/specs/conventions/<tema>.md` | explanation |
| Fluxo de agent | `.agents/WORKFLOWS.md` + `.agents/workflows/<x>.md` | how-to |

### Quadrantes (Diátaxis)

Escolher o quadrante errado é o defeito mais caro da doc: um tutorial no
lugar de `reference` envelhece no primeiro mês, e uma `reference` no lugar de
tutorial deixa o leitor sem caminho.

| Quadrante | Pergunta | Onde vive |
|---|---|---|
| `reference` | "o que é isto, exatamente?" | `docs/api/`, `docs/web/rotas.md`, README de package |
| `how-to` | "como eu faço X?" | `docs/como-rodar.md`, workflow, spec |
| `explanation` | "por que foi assim?" | `docs/adr/` |
| `tutorial` | "me leva do zero ao resultado" | README de package, `docs/flows/` |

## §4. Frescor e claims verificáveis

### 4.1 Claim numérico sem comando não entra

Ver [`tamanho-e-revisao.md § Verificabilidade de Claims Numéricos`](./tamanho-e-revisao.md).
Um doc que diz "8 endpoints" tem de dizer de onde saiu o 8.

### 4.2 Frescor ≠ data de edição

Frescor é **o doc afirmar o que o código ainda confirma**. Reescrever um doc
que continua certo é churn; deixar um doc que enveleceu é dívida.

### 4.3 Data de medição é obrigatória em doc canônico

Todo doc canônico da matriz §3 que **afirme** algo sobre o estado do código
declara a data da medição no cabeçalho:

```markdown
> Medido em 2026-10-29: os 7 endpoints abaixo conferem com o contrato gerado.
```

Sem data, o leitor não sabe se "conferem" é fato de hoje ou de seis meses
atrás — e a diferença entre as duas é exatamente o que ele veio buscar.

## §5. O gate — `check-doc-coverage`

A regra deste documento é **executável** (`guard-classes.md` §1: regra que
só existe em prosa é defeito).

```bash
pnpm ci:preflight        # roda o gate
```

O gate mede **uma** classe:

| Classe | Mede | Falha quando |
|---|---|---|
| **Cobertura** | toda unidade da matriz §3 tem o doc canônico | falta doc para um BC / rota / package |

### O que o gate **NÃO** mede (e é humano)

- **Frescor do conteúdo.** O gate vê se o doc **existe**, não se ele ainda
  diz a verdade. Um doc que descreve um endpoint removido continua
  "coberto" — quem pega é o `doc-sync` (reativo) e a auditoria do
  `documentation-specialist`.
- **O tamanho do doc.** O teto de 300 linhas é de
  [`tamanho-e-revisao.md`](./tamanho-e-revisao.md) e é medido na **auditoria**
  (skill `documentation-audit`), não por este gate: aplicá-lo a todo `.md`
  versionado transformaria um PR de documentação num PR de surgery, porque
  18 arquivos o violam — a maioria histórico. Duas classes, dois
  instrumentos, e nenhum afirma o que não faz.
- **Qualidade da prosa.** "Claro" não é propriedade mecânica.
- **Acerto do quadrante Diátaxis.** Julgamento editorial.

Dizer que o gate cobre freshness seria a classe 1 de `guard-classes.md` —
condição inalcançável.

### Exceções declaradas (nunca inferidas)

Uma exceção é uma **linha escrita**, com o motivo — o mesmo padrão de
`tdd.md`. Exceção não declarada = gate quebrado. Hoje o gate **não tem**
exceção: a matriz §3 é fechada e todo módulo, rota e package tem doc.

## §6. Quando NÃO aplicar

- **Histórico**: `docs/superpowers/plans/**`, `.agents/runs/**`, `docs/adr/**`
  (registro de decisão datada — não envelhece, é datado).
- **Artefato gerado**: `apps/api/openapi.json` (derivado de `openapi:export`;
  a fonte é o `@Api*` do controller).
- **Doc de terceiro/vendor**: `.agents/skills/graphify/**` (skill de
  ferramenta externa, versionada como está).
- **Testes e fixtures**: são autoexplicativos por definição.
- **Prosa de PR/issue**: vive fora do repo — nenhum gate a alcança
  (`pr-refresh` cobre o corpo do PR).
- **Ledger que cresce por desenho**:
  `.agents/specs/conventions/ci-defense-in-depth-pendencias.md` — o próprio
  cabeçalho do arquivo diz por quê ("aqui pendência cresce sem custar
  conteúdo"): registrar um item novo não pode exigir podar outro, porque o
  item podado é sempre o que ninguém está olhando. MEDIDO 2026-10-29:
  `wc -l` → **333** linhas, contra o teto de 300 — exceção **declarada**,
  não um descuido. O teto dos 300 continua valendo para todo o resto.

## §7. Quem é responsável

| Papel | Responsabilidade |
|---|---|
| `documentation-specialist` | dono da matriz §3, da auditoria e da escrita |
| `doc-writer` | escreve doc genérica sob demanda (texto, não cobertura) |
| `doc-sync` | reage ao diff e atualiza o doc afetado |
| `stack-code-reviewer` | cobra doc-sync em toda alteração de código |
| `code-reviewer` | revisa o texto novo (linguagem, exemplos, links) |
| `release-versioning-specialist` | dono dos footers de versão dos docs canônicos |

## §8. Cross-references

- Agent: [`.agents/agents/documentation-specialist.md`](../../agents/documentation-specialist.md)
- Skill: [`.agents/skills/documentation-audit/SKILL.md`](../../skills/documentation-audit/SKILL.md)
- Memória: [`.agents/memory/documentation-specialist.md`](../../memory/documentation-specialist.md)
- Gate: `.tooling/scripts/ci/check-doc-coverage.ts`
- Convenções vizinhas: [`tamanho-e-revisao.md`](./tamanho-e-revisao.md) ·
  [`dry.md`](./dry.md) · [`idioma.md`](./idioma.md) ·
  [`guard-classes.md`](./guard-classes.md) · [`e2e-playwright.md`](./e2e-playwright.md)

## §9. Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-10-29 | Criação. Matriz de cobertura (§3), fato único (§2), frescor (§4), gate `check-doc-coverage` (§5), exceções declaradas (§6). |
