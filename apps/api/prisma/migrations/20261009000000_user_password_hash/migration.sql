-- Migration: 20261009000000_user_password_hash
--
-- Torna a senha obrigatória em `users`.
--
-- A coluna entra NULLABLE de propósito, e não já NOT NULL, porque o
-- backfill precisa escrever um hash para as linhas que já existem: uma
-- coluna NOT NULL sem DEFAULT rejeita o `ADD COLUMN` quando a tabela tem
-- dados.
--
-- pt-BR: migration ESCRITA À MÃO — `prisma migrate dev` não roda neste
-- ambiente, porque não há Postgres local (`prisma migrate status` →
-- P1001). Ela não é idempotente por execução: rodar duas vezes falha no
-- `ADD COLUMN`, que é o comportamento normal de migration versionada
-- (`prisma migrate deploy` garante rodar uma vez).
--
-- ── Efeito colateral DELIBERADO ──────────────────────────────────────────
--
-- O `UPDATE` preenche `password_hash` com o hash argon2id de um segredo
-- ALEATÓRIO de 32 bytes (`randomBytes(32).toString('hex')` → 64 chars),
-- gerado uma única vez e embutido abaixo. A senha-plana desse segredo não
-- existe em lugar nenhum: nem variável de ambiente, nem backup, nem
-- ticket. Ela existe apenas como bytes que ninguém guardou.
--
-- Consequência, aceita de propósito: toda conta pré-existente fica SEM
-- SENHA CONHECIDA, logo não consegue autenticar. A alternativa — deixá-la
-- NULL e tratá-la como "primeiro acesso" — abriria um caminho de reset
-- sem verificação de identidade, o que é pior que quebrar o acesso. O
-- efeito colateral é público (o segredo está neste arquivo) e por isso
-- seguro: quem tem acesso ao arquivo tem acesso ao banco de qualquer
-- forma, e o hash não é reversível.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;

-- Backfill: hash argon2id de segredo aleatório (argon2id, m=65536, p=4, t=3).
UPDATE "users" SET "password_hash" = '$argon2id$v=19$m=65536,p=4,t=3$tIPgD9G6KLb3ipQtztNpzA$gHYfsfbFSsrBYY5GrY1epCkDyr/BaVsWnjVptgogwng' WHERE "password_hash" IS NULL;

-- Fecha a coluna: a partir daqui `users` exige senha.
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;