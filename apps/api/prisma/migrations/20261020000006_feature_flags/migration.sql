-- 20261020000006 — feature_flags: o estado das funcionalidades que o
-- administrador do sistema liga e desliga
--
-- CONTEXTO
-- As tabelas até aqui (`profiles`, `users`, `tenant_memberships`,
-- `invitations`, `authorizations`) são todas POR EMPRESA, e é por isso que cada
-- uma ganhou RLS nas migrations `20261020000000`–`20261020000002`. Esta é a
-- primeira tabela do schema que NÃO é por empresa: a pergunta que ela responde
-- é "esta funcionalidade está disponível no sistema inteiro?", e a resposta é a
-- mesma para todo ator.
--
-- POR QUE NÃO HÁ RLS NEM REVOKE AQUI (decisão D10 do plano)
-- A RLS deste banco filtra por `tenant_id`, com a policy chamando
-- `no_escopo_atual(tenant_id, …)`. `feature_flags` não tem coluna `tenant_id`,
-- então a policy não teria o que olhar: qualquer policy escrita aqui seria ou
-- um filtro sobre coluna inexistente ou uma condição constante inútil. Escrever
-- RLS aqui seria teatro de segurança — a proteção parece estar no banco e não
-- está.
--
-- O privilégio vem do `ALTER DEFAULT PRIVILEGES` da `20261020000000`
-- (SELECT, INSERT, UPDATE, DELETE para `app_runtime` em toda tabela nova), que
-- é o mesmo tratamento das outras tabelas de negócio. Nada a revogar:
--
--   - `DELETE` fica de propósito. Ele é a operação de emergência — apagar a
--     linha faz a flag voltar ao padrão (ATIVADA, D4), que é a direção segura.
--     Nenhum código consome DELETE; ele fica como recurso, não como bug.
--   - `TRUNCATE` nunca foi concedido a `app_runtime` (`20261020000000`,
--     linha 52), então nem em emergência ele apaga a base.
--
-- LINHA AUSENTE = ATIVADA (D4)
-- O `DEFAULT true` abaixo documenta o padrão, mas não é o mecanismo: quem
-- decide é o `PrismaFeatureFlagRepository.listar`, que devolve `true` para
-- chave que não encontrou na tabela. Uma chave nova entra no catálogo sem
-- migration e sem linha, e aparece ligada na tela.
--
-- ⚠️ `chave` é TEXT e não ENUM de propósito: o catálogo das chaves é código
-- revisável (`apps/api/src/shared/auth/feature-flag-catalog.ts`), e um ENUM
-- aqui duplicaria essa fonte de verdade dentro do banco, exigindo migration a
-- cada flag nova.

CREATE TABLE feature_flags (
  chave      text        PRIMARY KEY,
  -- A linha só existe para dizer "desligada". Guardar `true` é redundante.
  ativada    boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version    integer     NOT NULL DEFAULT 1
);

-- ⚠️ `updated_at` existe porque `FeatureFlag.updatedAt` é `@updatedAt` no
-- `schema.prisma`: o Prisma escreve a coluna a cada `update`. Sem ela, o
-- `upsert` passaria a falhar depois que alguém fechar o privilégio por coluna
-- (o caminho que a `20261020000005` tomou para `tenant_memberships`).
--
-- ⚠️ `version` ESTÁ INERTE, e é decisão (D16) — não sobra de outra feature.
-- MEDIDO 2026-10-18: `PrismaFeatureFlagRepository` nunca escreve nem lê a
-- coluna; o `upsert` do `definir` trata só `{chave, ativada}`. As duas rotas
-- respondem sem `ETag` e o PUT não exige `If-Match`, ao contrário do resto do
-- repositório (`users.controller.ts` manda `ETag: W/"v<n>"` e exige `If-Match`).
-- Ela fica porque o optimistic locking é o caminho natural quando existir cache
-- de flag — e o `FeatureFlagGuard` hoje lê o banco a CADA request da rota
-- protegida, que é o comportamento desejado para uma kill-switch. Quando o
-- cache entrar, ou a coluna passa a ser escrita e o PUT ganha `If-Match`, ou ela
-- sai em migration. O que não pode é continuar muda sem ninguém dizer por quê.