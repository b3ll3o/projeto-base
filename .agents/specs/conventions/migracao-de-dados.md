---
name: migracao-de-dados
version: 1.0
updated: 2026-10-16
maintainer: prisma-db-specialist
description: "Regra dos 3 passos para migracao de dados com risco (add nullable, backfill, drop) e quando nao ha backfill a fazer. Promovida de prisma-db-specialist.md:160, que era a unica fonte."
---

# Convenção: migração de dados

> Promovida em v1.12.0. Antes desta convenção a regra vivia só em
> [`prisma-db-specialist.md`](../../agents/prisma-db-specialist.md), como
> anti-padrão — regra de agent que nenhum arquivo de `conventions/` reunia.
> Este arquivo é a fonte; o agent aponta para cá.

## 1. QUANDO A REGRA DOS 3 PASSOS SE APLICA

Para qualquer mudança que **remove dado existente** ou que transforma coluna
nullable em `NOT NULL`:

| Mudança | 3 passos? |
|---------|-----------|
| `DROP COLUMN` | **sim** |
| `RENAME COLUMN` que quebra dado já gravado | **sim** |
| Renome de VALOR gravado (ex.: `role = 'owner'` → `'gerente'`) | **sim** — o dado gravado não muda com o código |
| Nullable → `NOT NULL` | **sim** |
| `SET NOT NULL` junto com `ADD COLUMN NOT NULL DEFAULT` | **não** — o default já popula |
| `ADD COLUMN` nullable nova | **não** — nada a migrar |
| Índice novo | **não** |
| Mudança de tipo compatível, sem perda | só se o dado existente violar o tipo |

⚠️ **Renome de VALOR é o mesmo furo do renome de COLUNA — e ele é mais
silencioso.** A coluna continua existindo, o dado continua válido, e o banco
não denuncia nada: quando a coluna é TEXT sem CHECK e sem enum, **os dois
valores convivem** sem que nenhuma constraint reclame. O único sintoma é a
**comparação que autoriza** passar a falhar para o dado velho — e essa
comparação costuma estar em outro arquivo, longe do rename.

MEDIDO 2026-10-22, PR #116: o catálogo da empresa renomeou o papel da
membership de `'owner'` para `'gerente'`, o código que grava passou a gravar o
valor novo, e a autorização do convite passou a exigir o valor novo. A
empresa criada **antes** do rename ficou com `role = 'owner'` gravado, e o
dono recebia **403 ao convidar** — sem erro, sem log, sem 500. O banco local
tinha 10 memberships assim, em 10 empresas.

## 2. OS 3 PASSOS

1. **add nullable** — a coluna nova entra nullável; `DROP` fica proibido
   enquanto existir linha legada que dependa dela.
2. **backfill** — popula as linhas existentes. Idempotente (roda duas vezes
   sem efeito) e com escopo explícito (`WHERE ... IS NULL`).
3. **drop do default** — `SET NOT NULL` só **depois** do backfill, e só se
   nenhum caminho novo puder criar linha sem o campo obrigatório.

O anti-padrão é o `DROP COLUMN` direto: apaga a coluna e, com ela, a única
prova de que a transformação foi feita.

## 3. QUANDO NÃO HÁ BACKFILL

Nem toda migração de schema tem dado a migrar. **Backfill sem dado é
trabalho inventado**: exigiria inventar um valor de destino (um tenant
padrão, uma empresa padrão) — que é decisão de produto, não de engenharia.

Medição que reverteu essa exigência no plano `2026-10-16-multi-tenant`:
o volume de dev tinha `users=1, profiles=0`, e a inferência "logo a Fase 2
precisa de fixture pré-tenancy" estava errada nas duas metades — a suíte e2e
sobe Postgres novo via testcontainers, e **não existe banco de produção**
(nenhuma infra de deploy). O que se verifica no lugar:

- quem exercita a migration (a e2e em container novo, e não o volume de dev);
- se existe banco de produção cujo dado seria perdido.

Se ambos forem "não", a fase segue **sem backfill** e a coluna legada vira
órfã declarada — remover a coluna fica para uma fase que tenha o que remover.

## 4. MANIFESTO DE MIGRAÇÃO

Migration de **modelo** e migration de **dados** não entram no mesmo PR: a
primeira é reversível por `migrate reset`, a segunda não.

## Referências

- Anti-padrão de origem: [`prisma-db-specialist.md`](../../agents/prisma-db-specialist.md)
- Precedente de backfill defensivo: `apps/api/prisma/migrations/20261009000000_user_password_hash/migration.sql:36`
- Evidência da reavaliação: gap G-004 em `.agents/runs/state-snapshot-20261017T000011Z.md`
