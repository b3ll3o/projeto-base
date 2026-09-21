# Design — Cadastro de Usuário com Auditoria Completa (Índice)

> **Data:** 2026-09-21
> **Branch:** `feat/cadastro-usuario-com-auditoria`
> **Status:** Aprovado (brainstorming completo)
> **Próximo passo:** `writing-plans` → plano de implementação TDD

## §1. Como ler este design

Este design está dividido em 7 arquivos irmãos. Leia nesta ordem:

| # | Arquivo | Conteúdo |
|---|---------|----------|
| 00 | `2026-09-21-cadastro-usuario-com-auditoria-design.md` (este) | Índice, decisões, contexto |
| 01 | [`01-arquitetura-ddd-hexagonal.md`](./2026-09-21-cadastro-usuario-com-auditoria-01-arquitetura-ddd-hexagonal.md) | Regra DDD/Hexagonal cross-cutting |
| 02 | [`02-modelo-dados.md`](./2026-09-21-cadastro-usuario-com-auditoria-02-modelo-dados.md) | Prisma schema + estrutura do módulo `users` |
| 03 | [`03-fluxos-operacoes.md`](./2026-09-21-cadastro-usuario-com-auditoria-03-fluxos-operacoes.md) | Fluxo de cada use case (CREATE/UPDATE/DELETE/RESTORE) |
| 04 | [`04-contrato-http.md`](./2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md) | Endpoints REST, DTOs, RFC 7807 |
| 05 | [`05-estrategia-testes.md`](./2026-09-21-cadastro-usuario-com-auditoria-05-estrategia-testes.md) | TDD + pirâmide de testes + DoD |
| 05b | [`05b-exemplos-testes.md`](./2026-09-21-cadastro-usuario-com-auditoria-05b-exemplos-testes.md) | Snippets canônicos de testes (referência) |
| 06 | [`06-impacto-cross-cutting.md`](./2026-09-21-cadastro-usuario-com-auditoria-06-impacto-cross-cutting.md) | Novos artefatos + atualizações em docs |

## §2. Contexto e Motivação

O projeto `base` é um **template de monorepo** com NestJS + Next.js + Prisma + PostgreSQL. A feature `cadastro-usuario-com-auditoria` estabelece dois entregáveis indissociáveis:

1. **Funcional**: CRUD de `User` com regras de auditoria completas (audit fields + soft delete + versionamento + histórico).
2. **Arquitetural**: Regra cross-cutting do monorepo — **todos os apps devem seguir DDD + Hexagonal (Ports & Adapters)**.

A regra de auditoria será propagada para **toda entidade de domínio** que vier a ser criada no monorepo, garantindo rastreabilidade, conformidade e auditoria histórica por padrão.

## §3. Decisões Tomadas (Resumo)

| # | Decisão | Escolha | Justificativa |
|---|---------|---------|---------------|
| D1 | Formato de histórico | **Snapshot completo por versão** (`<entity>_history`) | Consulta simples, restore trivial |
| D2 | Soft delete | **Mover para tabela `<entity>_archive`** | Archive = lixeira viva; history = auditoria completa |
| D3 | Escopo da regra | **Todas as entidades de domínio** | Consistência; tabelas técnicas ficam de fora |
| D4 | Versionamento | **Integer incremental + optimistic locking** | Combina com `If-Match`/ETag HTTP |
| D5 | Resolução Archive × History | **Manter ambas** (com semântica clara) | Archive para restore rápido; history para auditoria |
| D6 | Endpoint de restore | **Sim: `POST /<entity>/:id/restore { version: N }`** | Auditabilidade completa do restore |
| D7 | Camada de aplicação | **Camada de use cases no NestJS** | Independente de ORM, testável |
| D8 | Paradigma do monorepo | **DDD + Hexagonal obrigatório** | Isolamento, testabilidade, evolução |
| D9 | ORM da API | **Prisma 6** (já definido em STACK.md §2) | Type-safe, migrations versionadas, DX |
| D10 | CSS do frontend | **Tailwind 4** (já definido em STACK.md §3) | Utility-first, zero runtime, tree-shakeable |
| D11 | Code review por stack | **`stack-code-reviewer` roda automaticamente** em toda alteração de código (pre-commit + CI) | Detecta violações de padrão de stack (NestJS, NextJS, Prisma, DDD/Hexagonal) cedo |
| D12 | Sincronização de docs | **`doc-sync` roda automaticamente** após code change (pre-commit + CI) para revisar/atualizar/criar docs afetadas | Documentação nunca fica desatualizada em relação ao código |

## §4. Critérios de Sucesso

1. **Funcional**: CRUD de User funcional com auditoria completa, archive, restore, histórico navegável.
2. **Arquitetural**: Regra DDD/Hexagonal aplicada e validada; estrutura `domain/application/infrastructure` em todos os módulos.
3. **Qualidade**: Cobertura mínima por arquivo atingida; todos os testes passam; TDD cycle respeitado.
4. **Documentação**: ADR, skill de validação, OpenAPI exportado, docs atualizados.
5. **Operacional**: CI roda `tdd:check`, `lint`, `typecheck`, `test:integration`, `test:e2e`.

## §5. Próximos Passos

1. Invocar skill `superpowers:writing-plans` para gerar plano de implementação TDD detalhado.
2. Implementar em ciclos TDD Red→Green→Refactor.
3. PR para `main` após DoD completo (ver arquivo 05).

## §6. Referências Canônicas

- DDD em NestJS: <https://docs.nestjs.com/recipes/domain-driven-design>
- Prisma transactions: <https://www.prisma.io/docs/orm/prisma-client/queries/transactions>
- RFC 7807 (Problem Details): <https://datatracker.ietf.org/doc/html/rfc7807>
- Optimistic locking via `If-Match`: <https://datatracker.ietf.org/doc/html/rfc7232#section-3.1>
- Documentação interna:
  - [`docs/MONOREPO.md`](../../../MONOREPO.md)
  - [`docs/STACK.md`](../../../STACK.md)
  - [`AGENTS.md`](../../../../AGENTS.md)

---

**Aprovado por:** usuário
**Data de aprovação:** 2026-09-21
**Próximo artefato:** `docs/superpowers/plans/2026-09-21-cadastro-usuario-com-auditoria-plan.md`
