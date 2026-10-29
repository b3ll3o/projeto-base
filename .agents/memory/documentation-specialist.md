---
name: documentation-specialist-memory
description: Memória acumulada do agent documentation-specialist — a matriz de cobertura da doc, o que é freshness e o que o gate mede
---

# Memória: `documentation-specialist`

> Arquivo de memória do agent `documentation-specialist`.

## Decisões Tomadas

### 2026-10-29 — A cobertura é o que o gate mede; o frescor é humano

**Contexto:** a regra "a documentação é parte do código" nasceu sem
instrumento. A primeira versão do gate tentava medir também o frescor do
conteúdo — e não há como medir "o doc ainda diz a verdade" sem um modelo do
que o doc deveria dizer.

**Decisão:** o `check-doc-coverage` mede **cobertura** (existe doc canônico
para cada unidade da matriz) e **declara** que não mede frescor. Declarar o
limite é melhor que um gate que reporta verde sobre algo que não mediu
(`guard-classes.md`, classe 1).

### 2026-10-29 — A rota do frontend é medida por menção do path

**Contexto:** derivar a URL a partir da estrutura de diretórios do App Router
quebra em route groups `(x)`, slots paralelos `@x` e intercepting routes.

**Decisão:** o gate exige que o catálogo `docs/web/rotas.md` **mencione o path
relativo do arquivo** (`apps/web/app/admin/flags/page.tsx`). É mecânico e não
depende de interpretar o roteador. A limitação — "mencionar" não é "descrever" —
está escrita no cabeçalho do gate.

### 2026-10-29 — Três agentes de doc, três direções

**Contexto:** `doc-writer` (proativo, texto genérico), `doc-sync` (reativo,
diff) e este (proativo, ciente das stacks) se sobrepunham.

**Decisão:** cada um tem uma direção. `documentation-specialist` decide **onde**
a verdade mora e **em que formato**; `doc-writer` escreve o texto; `doc-sync`
reage ao diff. Nenhum substitui outro, e o `AGENTS.md` §1.2 diz isso.

## Padrões Descobertos

- O `doc-sync` mapeia **5 caminhos hardcoded** (`tooling/scripts/doc-sync.ts`):
  um módulo novo não gera ação, nem alerta, nem vermelho. É a razão de o gate
  novo existir.
- `docs/api/*.md` é o formato de referência de BC que já funciona — os 4 docs
  novos copiam ele em vez de inventar formato.
- `apps/api/openapi.json` é **versionado** (desde o #125). O texto "gitignored"
  sobreviveu em 3 docs e no `doc-sync.ts` — foi o drift mais barato de achar e
  o mais fácil de propagar.
- O `.env.example` da API (`apps/api/.env.example`) ainda manda
  `openssl rand -base64 48` para as senhas de papel; o runbook proíbe (o `/`
  encerra a credencial da URI). **Pendente** — não é escopo de doc.

## Lições Aprendidas

- ❌ Doc que **mente** é pior que doc que falta: o leitor perde tempo num
  caminho que não existe. Ausência é P1; mentira é P0.
- ❌ Freshness ≠ data de edição. Reescrever um doc que continua certo é churn.
- ❌ "Três modos de execução" no README, dois na prática: a promessa sem seção
  é um fato errado.
- ❌ Link para arquivo que ainda não está versionado quebra o `check-doc-refs`
  no CI — verificar em disco, não no plano.

## Sugestões de Evolução

- [ ] Versionar o `openapi.json` já é feito; falta uma **spec** legível gerada
      a partir dele (hoje `docs/api/<bc>.md` é escrito à mão — deriva).
- [ ] O gate de cobertura poderia medir também o **modelo de dados**: cada model
      do `schema.prisma` citado no doc do BC. Hoje é convenção, não gate.
- [ ] `apps/api/.env.example` precisa do `openssl rand -hex 32` (ver acima).
- [ ] O teto de 300 linhas de `.md` continua sem gate — 18 arquivos o violam,
      a maioria histórico. Declarar as exceções na convenção e medir na
      auditoria antes de virar gate.
