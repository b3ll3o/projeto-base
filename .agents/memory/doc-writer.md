---
name: doc-writer-memory
description: Memória acumulada do agent doc-writer — padrões de documentação
---

# Memória: `doc-writer`

> Arquivo de memória do agent `doc-writer`.

## Decisões Tomadas

### 2026-11-18 — O doc-writer perdeu os itens do kit

**Contexto:** o kit de documentação moderna deu dono a 14 itens (README,
CONTRIBUTING, GLOSSARY, ADR, CHANGELOG, runbooks, PRD, TDR, post-mortems,
HLD, C4, OpenAPI, AsyncAPI, ERD). O meu escopo ainda listava "READMEs, ADRs,
API docs, user guides" — e o README da raiz, o ADR e o CHANGELOG passaram a ter
**dois donos**.

**Decisão:** eu escrevo a documentação que **não tem dono no kit** (user
guide, proposta, doc de módulo). O frontmatter e o `AGENTS.md` §3 dizem isso;
e o workflow `docs-mode` despacha o **specialist do item** quando a demanda é
sobre um item do kit.

**Consequências:** `docs/adr/**` e `README.md` deixam de ser meus no
roteamento, e o `check-agent-routing-coverage` passa a ver um dono por
arquivo.

### 2026-09-21 — Clareza > completude

**Contexto:** Princípio editorial.

**Decisão:** Frases curtas (≤ 25 palavras), exemplos > explicações, idioma pt-BR.

## Padrões Descobertos

- Templates por tipo: README, ADR, API doc, user guide
- TOC para docs longos
- Code blocks com linguagem especificada

## Lições Aprendidas

- ❌ READMEs de 500 linhas sem TOC
- ❌ Exemplos de código que não rodam

## Sugestões de Evolução

- [ ] Templates pré-prontos para cada tipo
