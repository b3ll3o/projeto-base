// .tooling/scripts/ci/check-migrations-sem-model.spec.ts
//
// Spec do gate que fecha a classe do #134: uma tabela que as migrations
// criam e que o `schema.prisma` não descreve é uma tabela que um
// `prisma migrate dev` propõe DERRUBAR.
//
// ⚠️ O DIFFERENCIAL é o dente: sem uma tabela plantada sem model, o gate
// pode passar vazio — e um gate que passa vazio não é gate.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkMigrationsSemModel,
  tabelasCriadasPor,
  tabelasMapeadasPor,
} from './check-migrations-sem-model.js';

const SCHEMA_COM_MODEL = `model User {
  id String @id @db.Uuid
  @@map("users")
}

model FeatureFlag {
  chave String @id
  @@map("feature_flags")
}

enum AuditOperation {
  INSERT
  @@map("audit_operation")
}
`;

function repoCom(migrations: Record<string, string>, schema: string): string {
  const raiz = mkdtempSync(join(tmpdir(), 'gate-migrations-'));
  for (const [nome, sql] of Object.entries(migrations)) {
    const dir = join(raiz, 'apps', 'api', 'prisma', 'migrations', nome);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'migration.sql'), sql, 'utf-8');
  }
  const schemaDir = join(raiz, 'apps', 'api', 'prisma');
  mkdirSync(schemaDir, { recursive: true });
  writeFileSync(join(schemaDir, 'schema.prisma'), schema, 'utf-8');
  return raiz;
}

describe('tabelasCriadasPor()', () => {
  it('lê o nome da tabela, com ou sem aspas', () => {
    expect(tabelasCriadasPor('CREATE TABLE "users" (id UUID);')).toEqual(['users']);
    expect(tabelasCriadasPor('CREATE TABLE users (id UUID);')).toEqual(['users']);
    expect(tabelasCriadasPor('CREATE TABLE IF NOT EXISTS "x" (id UUID);')).toEqual(['x']);
  });

  it('NÃO conta índice, view nem type como tabela', () => {
    const sql = `
      CREATE TYPE audit_operation AS ENUM ('INSERT');
      CREATE INDEX users_email ON users (email);
      CREATE VIEW v_users AS SELECT 1;
    `;
    expect(tabelasCriadasPor(sql)).toEqual([]);
  });
});

describe('tabelasMapeadasPor()', () => {
  it('lê o `@@map` dos MODELS — e ignora o do ENUM', () => {
    const tabelas = tabelasMapeadasPor(SCHEMA_COM_MODEL);

    expect(tabelas.has('users')).toBe(true);
    expect(tabelas.has('feature_flags')).toBe(true);
    // O `@@map` de um enum é um TIPO, não uma tabela.
    expect(tabelas.has('audit_operation')).toBe(false);
  });
});

describe('checkMigrationsSemModel()', () => {
  it('CONTROLE POSITIVO: tudo mapeado fica VERDE', () => {
    const raiz = repoCom(
      {
        '20260101000000_init': 'CREATE TABLE "users" (id UUID NOT NULL);',
        '20260101000001_flags': 'CREATE TABLE "feature_flags" (chave TEXT NOT NULL);',
      },
      SCHEMA_COM_MODEL,
    );

    const res = checkMigrationsSemModel({ repoRoot: raiz });

    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it('⚠️ DIFERENCIAL: uma tabela de migration sem model fica VERMELHA', () => {
    // ⚠️ Este é o dente do gate — e o caso REAL do #134: a tabela
    // `chaves_de_assinatura` existia nas migrations e não no schema, e um
    // `migrate dev` propunha `DROP TABLE` nela.
    const raiz = repoCom(
      {
        '20260101000000_init': 'CREATE TABLE "users" (id UUID NOT NULL);',
        '20260101000001_segredo':
          'CREATE TABLE "chaves_de_assinatura" (nome TEXT PRIMARY KEY, segredo BYTEA NOT NULL);',
      },
      SCHEMA_COM_MODEL,
    );

    const res = checkMigrationsSemModel({ repoRoot: raiz });

    expect(res.ok).toBe(false);
    expect(res.errors.join('\n')).toContain('chaves_de_assinatura');
  });

  it('o repo REAL está VERDE (toda tabela das migrations tem model)', () => {
    const res = checkMigrationsSemModel({ repoRoot: process.cwd() });

    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });
});
