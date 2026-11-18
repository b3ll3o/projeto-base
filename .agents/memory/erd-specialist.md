---
name: erd-specialist-memory
description: Memória acumulada do agent erd-specialist — o schema tem 12 models e o erDiagram desenha 7; os 5 restantes (history, archive, feature_flag, chaves_de_assinatura, idempotency_keys) só existem na tabela §1.1; a fonte do dado é o schema.
---

# Memória: `erd-specialist`

## Decisões Tomadas

### 2026-11-18 — A cobertura do ERD se mede em dois lugares: diagrama **e** §1.1

**Contexto:** o `docs/system-design/dados.md` §1 abre com "12 models" e
desenha um `erDiagram` com **7** entidades. Os outros models **não**
desapareceram: a §1.1 — "Os seis models que **não** têm relação com FK" —
descreve `users_history`, `users_archive`, `feature_flags`,
`chaves_de_assinatura`, `refresh_tokens` e `idempotency_keys` numa tabela.
São **seis** porque o `refresh_tokens` aparece nos dois lugares (é entidade
do diagrama **e** linha da §1.1 — não tem FK, mas é sessão).

**Decisão:** a cobertura de um model é "está no `erDiagram` **ou** está na
tabela da §1.1"; um model nos dois é legítimo. A medição é
`grep -c "^model "` contra (entidades do `erDiagram` + linhas da §1.1),
descontando a interseção.

> Estado medido em 2026-11-18: **12** models no schema, **7** entidades no
> `erDiagram`, **6** linhas na §1.1, **1** interseção → **5** models sem
> entidade no diagrama: `UserHistory`, `UserArchive`, `FeatureFlag`,
> `ChaveDeAssinatura`, `IdempotencyKey`.

### 2026-11-18 — A fonte é o schema; o diagrama aponta

**Contexto:** o `prisma-db-specialist` é dono do `schema.prisma` e da skill
`prisma-audit` (drift, N+1, lens DDD/H1-H6). O ADR-0010 fixa a doutrina do
`dry.md`: "o doc de system design **aponta**, não reescreve".

**Decisão:** quando o diagrama e o schema divergem, o **schema vence** e o
conserto é meu (no diagrama). Eu não edito `schema.prisma` — quem faz isso
é o `prisma-db-specialist`, com migration e regra dos 3 passos. O relatório
traz `divergencias: [{ model, diagrama, schema, correcao }]` — os dois lados
e o conserto, para que ninguém precise adivinhar de qual lado veio a
verdade.

### 2026-11-18 — As seções de política não são atualizadas junto do diagrama

**Contexto:** o `dados.md` tem §2 (escopo), §3 (fonte única), §4
(consistência), §6 (idempotência), §7 (migração) e §8 (custo). Essas seções
descrevem **decisão**, e a decisão tem ADR — não coluna.

**Decisão:** model novo **não** muda §2-§8. Se elas ficaram para trás, a
correção vem do ADR que mudou a política, não de retocar o doc por conta
própria. Divergência entre diagrama e seção de política é **finding** que
aponta o ADR, não texto novo.

## Padrões Descobertos

- RLS ligada em **9** tabelas (medido em 2026-11-18):
  `grep -rh "ALTER TABLE .* ENABLE ROW LEVEL SECURITY" apps/api/prisma/migrations/*/migration.sql | awk '{print $3}' | sort -u | wc -l` → `9`.
  O `dados.md` §1.1 nomeia as 9: `authorizations`, `chaves_de_assinatura`,
  `invitations`, `profiles`, `tenant_memberships`, `tenants`, `users`,
  `users_archive`, `users_history`.
- As **3** tabelas sem RLS são `feature_flags`, `refresh_tokens` e
  `idempotency_keys` — e as três têm **outro** controle: `REVOKE ALL` do
  papel `app_runtime`. `feature_flags` é global por decisão (a pergunta é
  "isto existe no sistema?"); as outras duas guardam PII de outra empresa.
- `FORCE ROW LEVEL SECURITY` **não** é usado, de propósito — migrations e
  seed precisam escrever em tudo. Quem audita isolamento pergunta **quem
  conecta**.
- O `dados.md` §3 é a confirmação do item 10 do kit: "O PostgreSQL é o
  único sistema de registro. Não há fila, não há cache distribuído." — e
  por isso o cache é **in-process**, TTL de 5 s, cacheando a autorização
  junto.

## Lições Aprendidas

- ❌ Dizer "faltam 5 models no diagrama" sem dizer **onde** eles estão
  (§1.1). A cobertura do item 11 é diagrama **ou** §1.1.
- ❌ Editar o `schema.prisma` para o diagrama "encaixar" — a fonte é o
  schema, e mudá-lo é trabalho do `prisma-db-specialist`, com migration.
- ❌ Colar as colunas do schema no `dados.md` — duplicação que envelhece
  nos dois lados.
- ❌ Tratar §2-§8 como "atualização do ERD" — são política, e política
  muda por ADR.

## Sugestões de Evolução

- [ ] Um gate que compare a lista de entidades do `erDiagram` com a lista de
  models do `schema.prisma` e acuse a interseção — hoje a cobertura do item
  11 é humana.
- [ ] Registrar o `dados.md` no registry `.tooling/scripts/ci/doc-claims.json`
  — ele já cita 9, 12 e 7 com o comando ao lado, e o `check-doc-claims`
  ainda não os mede.
