-- Fase 5 (plano 2026-10-16-multi-tenant) — o segredo do convite (D5).
--
-- A Fase 2 criou `invitations` como par `(tenant_id, email)`, e a Revisão
-- v1.1.0 já tinha marcado o ramo do convite como INALCANÇÁVEL por falta de
-- produtor. O produtor existe agora (`POST /tenants/:id/invitations`) — e ele
-- precisa de algo que o convidado não possa adivinhar pelo email: o par
-- `(tenant_id, email)` é dado público (é a lista de quem a empresa convidou).
--
-- Sem esta coluna, o aceite seria "POST /invitations/accept com o id da
-- empresa": qualquer pessoa que já esteve na empresa conhece aquele id do
-- histórico e voltaria depois de ter sido removida.
--
-- SEM BACKFILL, e a migration FALHA alto em vez de inventar token
-- (`.agents/specs/conventions/migracao-de-dados.md` §1 e §3): o §3 registra
-- que não existe banco de produção, então `SET NOT NULL` numa tabela vazia
-- passa. Se algum dia existir dado, este `SET NOT NULL` acusa o banco em vez
-- de preencher tokens que ninguém emitiu — um token gerado por migration não
-- seria segredo de ninguém e transformaria toda convite legada em convite
-- válido para qualquer um que lesse o banco.

ALTER TABLE "invitations" ADD COLUMN "token" TEXT;

ALTER TABLE "invitations" ALTER COLUMN "token" SET NOT NULL;

-- UNIQUE global (e não `(tenant_id, token)`): o aceite resolve o convite
-- SÓ pelo token, então dois convites com o mesmo token em empresas
-- diferentes fariam o `findFirst` escolher um deles — e o aceite valeria
-- para a empresa errada, que é exatamente o vazamento que o token existe
-- para impedir.
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");