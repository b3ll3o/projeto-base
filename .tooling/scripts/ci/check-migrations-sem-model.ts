/**
 * SEM shebang, de propósito.
 *
 * Gate que fecha a classe do issue #134: uma tabela que as MIGRATIONS
 * criam e que o `schema.prisma` não descreve é uma tabela que um
 * `prisma migrate dev` — ou um `prisma migrate diff` — quer DERRUBAR.
 *
 * MEDIDO em 2026-11-08 (Postgres 16 real, as 17 migrations aplicadas):
 * `prisma migrate diff --from-url <banco vivo> --to-schema-datamodel` emitia
 *
 *   -- DropTable
 *   DROP TABLE "chaves_de_assinatura";
 *
 * A tabela guardava a chave de assinatura do `criar_membership` — e perdê-la
 * quebrava o onboarding inteiro (42501 "chave de assinatura ausente para
 * membership"). O `migrate deploy` (o caminho do CI e do container) nunca
 * apaga tabela, e por isso o drift era INVISÍVEL lá.
 *
 * ⚠️ POR QUE UM GATE, E NÃO UM COMANDO: o comando (`prisma migrate diff`)
 * exige um banco no ar. Um gate que precisa de banco roda em "skipped" no
 * CI — e a divergência volta a ser invisível. Este gate é ESTÁTICO: ele
 * compara o que as migrations criam com o que o datamodel mapeia.
 *
 * ⚠️ A REGRA É UNIDIRECIONAL: uma tabela do BANCO sem model no schema é
 * erro (o `migrate dev` a derrubaria). O contrário — um model no schema sem
 * tabela no banco — é a situação NORMAL de quem escreve o model antes da
 * migration, e não é erro deste gate (é o `prisma migrate dev` que resolve).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface CheckResult {
  ok: boolean;
  errors: string[];
  advisories: string[];
}

/**
 * As tabelas que um conjunto de migrations SQL cria.
 *
 * ⚠️ Só `CREATE TABLE` — e não `CREATE TYPE`/`CREATE INDEX`/`CREATE VIEW`:
 * um índice não é tabela, e um tipo (o `audit_operation`) é outra coisa.
 */
export function tabelasCriadasPor(sql: string): string[] {
  const tabelas: string[] = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|([\w.]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const nome = m[1] ?? m[2];
    if (nome !== undefined && nome !== '') tabelas.push(nome);
  }
  return tabelas;
}

/**
 * As tabelas que os MODELS do `schema.prisma` mapeiam.
 *
 * ⚠️ Só os blocks `model` — o `@@map` de um `enum` é um TIPO, e compará-lo
 * com as tabelas seria comparar coisas diferentes.
 */
export function tabelasMapeadasPor(schema: string): Set<string> {
  const tabelas = new Set<string>();
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema)) !== null) {
    const nome = m[1] ?? '';
    const corpo = m[2] ?? '';
    const mapa = /@@map\("([^"]+)"\)/.exec(corpo);
    // ⚠️ (#134) Um model SEM `@@map` mapeia a tabela com o NOME do model — é a
    // convenção do Prisma. Sem esta linha, o gate acusaria como "tabela sem
    // model" uma tabela que TEM model (e o primeiro model sem `@@map` — que o
    // Prisma aceita — travaria o preflight).
    if (mapa) tabelas.add(mapa[1]!);
    else if (nome !== '') tabelas.add(nome);
  }
  return tabelas;
}

/** O gate. */
export function checkMigrationsSemModel(opts: {
  repoRoot: string;
  migrationsDir?: string;
  schemaPath?: string;
}): CheckResult {
  const errors: string[] = [];
  const advisories: string[] = [];
  const root = path.resolve(opts.repoRoot);
  const migrationsDir = path.resolve(
    opts.migrationsDir ?? path.join(root, 'apps/api/prisma/migrations'),
  );
  const schemaPath = path.resolve(
    opts.schemaPath ?? path.join(root, 'apps/api/prisma/schema.prisma'),
  );

  if (!existsSync(migrationsDir)) {
    return { ok: true, errors, advisories: [`${migrationsDir} ausente — nada a medir`] };
  }
  if (!existsSync(schemaPath)) {
    return { ok: true, errors, advisories: [`${schemaPath} ausente — nada a medir`] };
  }

  const criadas = new Map<string, string>();
  for (const entrada of readdirSync(migrationsDir).sort()) {
    const arquivo = path.join(migrationsDir, entrada, 'migration.sql');
    if (!existsSync(arquivo)) continue;
    for (const tabela of tabelasCriadasPor(readFileSync(arquivo, 'utf-8'))) {
      if (!criadas.has(tabela)) criadas.set(tabela, entrada);
    }
  }

  const mapeadas = tabelasMapeadasPor(readFileSync(schemaPath, 'utf-8'));

  for (const [tabela, migration] of criadas) {
    if (mapeadas.has(tabela)) continue;
    errors.push(
      `a migration '${migration}' cria a tabela "${tabela}", e o schema.prisma ` +
        `NÃO tem model que a mapeie — um \`prisma migrate dev\` (ou um ` +
        `\`prisma migrate diff\`) propõe DERRUBÁ-la (#134). A tabela pode ` +
        `guardar dado vivo: o que ela guarda decide o quão caro é perdê-la.`,
    );
  }

  if (criadas.size === 0) {
    advisories.push('nenhuma tabela criada por migration — nada a medir');
  } else {
    advisories.push(
      `tabelas criadas por migrations: ${criadas.size}; com model no schema: ` +
        `${[...criadas.keys()].filter((t) => mapeadas.has(t)).length}`,
    );
  }

  return { ok: errors.length === 0, errors, advisories };
}
