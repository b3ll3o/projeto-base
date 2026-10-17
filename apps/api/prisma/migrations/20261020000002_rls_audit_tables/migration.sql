-- ───────────── Fase 10+ — RLS de `users_history` e `users_archive` ─────────────
--
-- A §3 da migration `20261020000001` declarava, e subdeclarava, o que a
-- ausência das duas entregava. `users_history.entity_id` e
-- `users_archive.entity_id` são o **uuid do usuário** — `user-use-cases.ts` grava
-- `entityId: ev.aggregateId`, e o agregado é o `User`. Uma sessão `app_runtime`
-- da ACME lia o id de um usuário da GLOBEX, inseria
-- `tenant_memberships (user_id = <alheio>, tenant_id = <acme>)` — e
-- `memberships_insercao` confere SÓ o `tenant_id`, nunca o `user_id` — e a partir
-- daí `usuario_no_escopo(<alheio>)` valia TRUE, abrindo o `password_hash` dele
-- para leitura e reescrita. Era o [B] e o [D] do cabeçalho da §1 voltando por
-- uma tabela que ninguém tinha fechado.
--
-- A empresa elegida é a MESMA de `users`: `usuario_no_escopo(entity_id)`. Não há
-- `tenant_id` nestas tabelas (o vínculo é o do agregado auditado) e não há
-- `entity_name` — as duas tabelas são de `User` por construção do schema.
--
-- ⚠️ O PREÇO, que é uma decisão de produto e não um efeito colateral:
-- a auditoria de quem SAIU da empresa fica invisível para a empresa que saiu
-- (fail-closed — a empresa que era perde a prova de que a pessoa existiu), e
-- continua visível só para a sessão de SISTEMA. O contrário — manter o
-- histórico legível para uma empresa que já não tem mais o vínculo — é
-- justamente a leitura cross-tenant que esta migration fecha.

-- ─────────────────────────── users_history ───────────────────────────

ALTER TABLE users_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY history_leitura ON users_history FOR SELECT
  USING (usuario_no_escopo(entity_id));

CREATE POLICY history_insercao ON users_history FOR INSERT
  WITH CHECK (usuario_no_escopo(entity_id));

-- pt-BR: sem policy de UPDATE e sem policy de DELETE. O `PrismaAuditService`
-- não tem nenhum dos dois verbos sobre `users_history` — histórico é
-- append-only por desenho. Ausência de policy aqui é fail-closed, e é o que
-- impede que o próximo verbo apareça na aplicação e já esteja barrado.

-- ─────────────────────────── users_archive ───────────────────────────

ALTER TABLE users_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY archive_leitura ON users_archive FOR SELECT
  USING (usuario_no_escopo(entity_id));

CREATE POLICY archive_insercao ON users_archive FOR INSERT
  WITH CHECK (usuario_no_escopo(entity_id));

-- `archive()` é um UPSERT, e o upsert do Prisma traz UPDATE junto — logo aqui a
-- segunda policy não é opcional. `USING` e `WITH CHECK` valem a mesma coisa e
-- pela mesma razão: se a linha é da outra empresa, o `USING` não a alcança e o
-- `ON CONFLICT DO UPDATE` casa zero linhas.
--
-- O efeito de borda do upsert: arquivar um usuário ALHEIO não dá 42501, dá
-- `P2025` (o `RETURNING` do `DO UPDATE` não devolve linha). Isso é a resposta
-- certa — a escrita não acontece — e não chega ao cliente como 500, porque
-- `UserUseCases.softDelete` chama `userRepo.save(...)` ANTES do `archive()`, e
-- esse é o ponto onde um usuário fora do escopo já morreu com erro de domínio.
CREATE POLICY archive_atualizacao ON users_archive FOR UPDATE
  USING (usuario_no_escopo(entity_id))
  WITH CHECK (usuario_no_escopo(entity_id));

-- ⚠️ `DELETE` de arquivo também não tem policy, pelo mesmo motivo do histórico:
-- o serviço nunca apaga arquivo, e o `delete` de `users` faz soft-delete (vai
-- para `users_archive`, não sai da tabela).