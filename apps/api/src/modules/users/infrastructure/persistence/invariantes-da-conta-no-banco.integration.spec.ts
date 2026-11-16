// apps/api/src/modules/users/infrastructure/persistence/invariantes-da-conta-no-banco.integration.spec.ts
//
// pt-BR (2026-11-16): as invariantes da conta `users` TEM DONO NO BANCO.
//
// O QUE ESTE ARQUIVO PROVA (e por que precisa de um Postgres de verdade)
// ─────────────────────────────────────────────────────────────────────────────
// Duas invariantes da linha `users` viviam SÓ em TypeScript, e as duas
// quebraram a aplicação de uma vez (medido em 2026-11-16 no banco local):
//
//   1. `password_hash` tem de ser um hash argon2id — o VO `PasswordHash`;
//   2. `id` tem de ser um UUID v7 — o VO `UserId`.
//
// Nove linhas violavam as DUAS (o mesmo lote, gravado por fora da aplicação):
// `password_hash = 'x'` e `id` com versão UUID 4. E a listagem de usuários
// hidrata TODAS as linhas da página, então uma linha ilegível derrubava a
// página inteira: com o hash, o `UserPersistenceException` virava 500; com o
// id, o `UserValidationException` virava 400 — um 400 que diz "o identificador
// precisa ser um UUID v7 válido" para um cliente que não mandou id nenhum.
//
// O conserto é o dono das regras no BANCO (uma CHECK constraint para cada
// invariante). O risco de um conserto desses é a REGRA DIVERGIR: se o banco
// aceitar um valor que o VO recusa, o 500 volta — só que agora com a
// constraint "verde". Por isso este spec não mede a constraint sozinha: ele
// mede a constraint E o VO no MESMO corpus, e afirma a implicação que fecha o
// buraco.
//
//   banco aceitou  ⟹  o VO aceita
//
// A implicação é assertada nos DOIS sentidos que importam:
//   • o que o banco aceita, o VO aceita (a linha passa pela aplicação);
//   • o que o VO aceita e o banco recusa é a DIVERGÊNCIA DECLARADA, e ela é
//     na direção segura — o banco recusa ANTES de a aplicação ler.
//
// ⚠️ Por que o corpus está nas tabelas, e não gerado: a tabela é a EXPECTATIVA.
// Se a regra mudar de um lado, a spec fica vermelha e o outro lado é ajustado
// junto. Um corpus gerado a partir da própria implementação mediria que a
// implementação é consistente com ela mesma — que é sempre verdade, e não
// prova nada.
//
// O helper sobe um Postgres de verdade e roda `prisma migrate deploy`
// (`apps/api/test/testcontainers-helper.ts`) — o banco de teste já tem as
// constraints aplicadas, porque elas são MIGRATIONS. Por isso os blocos de
// reparo precisam derrubar a constraint antes de recriar a linha quebrada.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../../test/testcontainers-helper.js';
import { PasswordHash } from '../../domain/value-objects/password-hash.vo.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';

// pt-BR: o caminho das migrations, resolvido a partir do próprio spec (não de
// `process.cwd()`) — o mesmo motivo de `apps/api/src/main.ts.spec.ts`:
// `pnpm test:integration` roda com CWD=apps/api/, e `pnpm vitest run` direto
// roda com CWD=monorepo root.
const specDir = dirname(fileURLToPath(import.meta.url));

/** As migrations que o spec reaplica (uma por arquivo — o Prisma não aceita dois comandos). */
const CAMINHOS_DAS_MIGRATIONS = {
  hashReparo: resolve(
    specDir,
    '../../../../../prisma/migrations/20261116000001_password_hash_reparo/migration.sql',
  ),
  hashConstraint: resolve(
    specDir,
    '../../../../../prisma/migrations/20261116000002_password_hash_constraint/migration.sql',
  ),
  idReparo: resolve(
    specDir,
    '../../../../../prisma/migrations/20261116000004_user_id_reparo/migration.sql',
  ),
  idConstraint: resolve(
    specDir,
    '../../../../../prisma/migrations/20261116000005_user_id_constraint/migration.sql',
  ),
} as const;

/** Os nomes das constraints — os mesmos que o banco de teste recebe do `migrate deploy`. */
const CONSTRAINT_DO_HASH = 'users_password_hash_argon2id';
const CONSTRAINT_DO_ID = 'users_id_uuid_v7';

/**
 * Um caso do corpus: o que cada lado diz de cada valor.
 *
 * `banco` e `vo` são a EXPECTATIVA de cada lado, escrita à mão — e é por isso
 * que ela pode ser conferida contra a implementação. Os dois lados foram
 * medidos em 2026-11-16 contra um Postgres 16 real e contra os VOs.
 */
interface Caso {
  nome: string;
  valor: string;
  /** O banco aceita este valor? */
  banco: boolean;
  /** O value object aceita este valor? */
  vo: boolean;
  /**
   * POR QUE o banco recusou — e o spec mede a razão, não só a recusa.
   *
   * ⚠️ `constraint` é a CHECK constraint (`23514`); `cast` é o banco nem
   * conseguir converter o valor (`22P02`, que o Prisma reporta como
   * `P2023`). Um teste que só olhasse "recusou" passaria pelo motivo errado
   * — e o motivo errado é o defeito que o spec existe para achar.
   */
  motivo?: 'constraint' | 'cast';
}

/** O corpus do HASH. */
const CORPUS_DO_HASH: Caso[] = [
  {
    nome: 'argon2id canônico (m,t,p)',
    valor: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0c2FsdHNhbHQ$ZGlnZXN0ZGlnZXN0',
    banco: true,
    vo: true,
  },
  {
    nome: 'argon2id na ordem que a lib escreve (m,p,t)',
    valor:
      '$argon2id$v=19$m=65536,p=4,t=3$tIPgD9G6KLb3ipQtztNpzA$gHYfsfbFSsrBYY5GrY1epCkDyr/BaVsWnjVptgogwng',
    banco: true,
    vo: true,
  },
  {
    nome: 'argon2id com os parâmetros em t,m,p',
    valor: '$argon2id$v=19$t=3,m=65536,p=4$c2FsdHNhbHRzYWx0c2FsdHNhbHQ$ZGlnZXN0ZGlnZXN0',
    banco: true,
    vo: true,
  },
  {
    nome: 'argon2id com os parâmetros em t,p,m',
    valor: '$argon2id$v=19$t=3,p=4,m=65536$c2FsdHNhbHRzYWx0c2FsdHNhbHQ$ZGlnZXN0ZGlnZXN0',
    banco: true,
    vo: true,
  },
  {
    nome: 'argon2id com os parâmetros em p,m,t',
    valor: '$argon2id$v=19$p=4,m=65536,t=3$c2FsdHNhbHRzYWx0c2FsdHNhbHQ$ZGlnZXN0ZGlnZXN0',
    banco: true,
    vo: true,
  },
  {
    nome: 'argon2id com os parâmetros em p,t,m',
    valor: '$argon2id$v=19$p=4,t=3,m=65536$c2FsdHNhbHRzYWx0c2FsdHNhbHQ$ZGlnZXN0ZGlnZXN0',
    banco: true,
    vo: true,
  },
  {
    nome: 'envelope curto (salt de 4, digest de 6)',
    valor: '$argon2id$v=19$m=65536,p=4,t=3$J44j$digest',
    banco: true,
    vo: true,
  },
  {
    nome: 'o valor corrompido medido no banco local',
    valor: 'x',
    banco: false,
    vo: false,
  },
  {
    nome: 'senha em claro',
    valor: 'senha-em-claro',
    banco: false,
    vo: false,
  },
  {
    nome: 'bcrypt (o formato que o ADR-0002 rejeitou)',
    valor: '$2b$12$abcdefghijklmnopqrstuvwxyz0123456789012345678901',
    banco: false,
    vo: false,
  },
  {
    nome: 'argon2id sem m/t/p',
    valor: '$argon2id$v=19$m=65536$c2FsdA$hash',
    banco: false,
    vo: false,
  },
  {
    nome: 'argon2id com m duplicado',
    valor: '$argon2id$v=19$m=1,m=2,t=3,p=4$c2FsdA$hash',
    banco: false,
    vo: false,
  },
  {
    nome: 'argon2id com parâmetro extra de valor numérico',
    valor: '$argon2id$v=19$m=65536,t=3,p=4,keyid=123$c2FsdA$hash',
    banco: false,
    vo: true,
  },
  {
    // A MESMA classe do caso acima, com outro membro: o banco recusa
    // QUALQUER `nome=número` além de `m`, `t` e `p`, onde quer que ele
    // apareça no bloco.
    nome: 'argon2id com parâmetro extra de valor numérico no começo do bloco',
    valor: '$argon2id$v=19$keyid=123,m=65536,t=3,p=4$c2FsdA$hash',
    banco: false,
    vo: true,
  },
  {
    // O SEGUNDO ponto em que o banco é mais estrito que o VO: o teto. O VO
    // conta unidades UTF-16 e o banco conta BYTES — e um caractere astral
    // (emoji) vale 2 unidades e 4 bytes. Este valor tem 38 caracteres ASCII
    // + 200 emojis: 438 unidades UTF-16 (o VO aceita) e 838 bytes (o banco
    // recusa).
    nome: 'argon2id com caractere multibyte no digest',
    valor: `$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$${'😀'.repeat(200)}`,
    banco: false,
    vo: true,
  },
  {
    nome: 'argon2id com parâmetro extra de valor não numérico',
    valor: '$argon2id$v=19$m=65536,t=3,p=4,keyid=abc$c2FsdA$hash',
    banco: false,
    vo: false,
  },
  {
    // A VARIANTE errada: argon2i e argon2d não são argon2id. O regex do banco
    // é `^\$argon2id\$` — e um regex afrouxado aqui aceitaria argon2i.
    nome: 'argon2i (a variante errada)',
    valor: '$argon2i$v=19$m=65536,t=3,p=4$c2FsdA$ZGlnZXN0',
    banco: false,
    vo: false,
  },
  {
    nome: 'argon2d (a variante errada)',
    valor: '$argon2d$v=19$m=65536,t=3,p=4$c2FsdA$ZGlnZXN0',
    banco: false,
    vo: false,
  },
  {
    nome: 'argon2id com parâmetro fracionário',
    valor: '$argon2id$v=19$m=65.5,t=3,p=4$c2FsdA$hash',
    banco: false,
    vo: false,
  },
  {
    nome: 'argon2id com parâmetro negativo',
    valor: '$argon2id$v=19$m=65536,t=3,p=-4$c2FsdA$hash',
    banco: false,
    vo: false,
  },
  {
    nome: 'argon2id com salt vazio',
    valor: '$argon2id$v=19$m=65536,t=3,p=4$$hash',
    banco: false,
    vo: false,
  },
  {
    nome: 'argon2id sem digest',
    valor: '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$',
    banco: false,
    vo: false,
  },
  {
    nome: 'argon2id com v= não numérico',
    valor: '$argon2id$v=x$m=65536,t=3,p=4$c2FsdA$hash',
    banco: false,
    vo: false,
  },
  {
    nome: 'argon2id com parâmetro em maiúscula',
    valor: '$argon2id$v=19$M=65536,t=3,p=4$c2FsdA$hash',
    banco: false,
    vo: false,
  },
  {
    nome: 'argon2id acima de 512 caracteres',
    valor: `$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$${'A'.repeat(600)}`,
    banco: false,
    vo: false,
  },
];

/** O corpus do ID. */
const CORPUS_DO_ID: Caso[] = [
  {
    nome: 'uuid v7 (o formato que o UserId gera)',
    valor: '01a1e5f8-62f4-7d5f-b8f8-bcb72367da9b',
    banco: true,
    vo: true,
  },
  {
    nome: 'uuid v7 em maiúsculas (o VO usa a flag i)',
    valor: '01A1E5F8-62F4-7D5F-B8F8-BCB72367DA9B',
    banco: true,
    vo: true,
  },
  {
    nome: 'uuid v4 (o que as 9 linhas quebradas tinham)',
    valor: '5e82103f-1ed2-4405-b099-ac2f5a08625b',
    banco: false,
    vo: false,
  },
  {
    nome: 'uuid nil',
    valor: '00000000-0000-0000-0000-000000000000',
    banco: false,
    vo: false,
  },
  {
    nome: 'uuid v1',
    valor: '0b3e6f1c-8a2d-11ef-9c3a-0242ac120002',
    banco: false,
    vo: false,
  },
  {
    nome: 'texto que não é uuid',
    valor: 'nao-e-um-uuid',
    banco: false,
    vo: false,
    // Não é a constraint que recusa: é o CAST. O valor nem chega a ser
    // uma coluna.
    motivo: 'cast',
  },
];

/**
 * As CLASSES de divergência declarada: onde o banco é mais estrito que o VO.
 *
 * ⚠️ Uma classe, e não um caso: o banco recusa qualquer `nome=número` além
 * de `m`, `t` e `p` — onde quer que ele apareça no bloco — e o banco conta
 * o teto em BYTES enquanto o VO conta unidades UTF-16. As duas divergências
 * são na direção segura (o banco recusa antes de a aplicação ler), e o spec
 * abaixo afirma que TODA divergência do corpus pertence a uma destas classes.
 */
const CLASSES_DE_DIVERGENCIA = [
  'argon2id com parâmetro extra de valor numérico',
  'argon2id com caractere multibyte no digest',
];

/** O que o value object do hash diz do valor — sem exceção escapando. */
function voAceitaHash(valor: string): boolean {
  try {
    PasswordHash.create(valor);
    return true;
  } catch {
    return false;
  }
}

/** O que o value object do id diz do valor — sem exceção escapando. */
function voAceitaId(valor: string): boolean {
  try {
    UserId.create(valor);
    return true;
  } catch {
    return false;
  }
}

describe('As invariantes da conta no BANCO (users.id e users.password_hash)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
  });

  /**
   * O MOTIVO da recusa — e `null` quando a escrita passou.
   *
   * ⚠️ O motivo é o que separa "a constraint recusou" (`23514`, que o Prisma
   * reporta dentro da mensagem do `PrismaClientUnknownRequestError`) de "o
   * banco nem conseguiu converter o valor" (`P2023`).
   */
  async function motivoDaRecusa(id: string, hash: string): Promise<string | null> {
    try {
      await ctx.prisma.user.create({
        data: { id, email: `${id}@teste.local`, name: 'Alguém', passwordHash: hash },
      });
      return null;
    } catch (erro) {
      const codigo = (erro as { code?: unknown }).code;
      if (codigo === 'P2023') return 'cast';
      const mensagem = (erro as { message?: unknown }).message;
      if (typeof mensagem === 'string' && mensagem.includes('23514')) return 'constraint';
      return 'desconhecido';
    }
  }

  /** Tenta gravar a conta e devolve o que o banco respondeu. */
  async function bancoAceita(id: string, hash: string): Promise<boolean> {
    return (await motivoDaRecusa(id, hash)) === null;
  }

  describe('as constraints existem', () => {
    it.each([
      ['users_password_hash_argon2id', CONSTRAINT_DO_HASH],
      ['users_id_uuid_v7', CONSTRAINT_DO_ID],
    ])('a constraint %s está no banco de teste', async (_nome, conname) => {
      const existe = await ctx.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count
          FROM pg_constraint
         WHERE conname = ${conname}
           AND conrelid = 'users'::regclass
      `;
      expect(Number(existe[0]?.count ?? 0)).toBe(1);
    });
  });

  describe('a escrita inválida é recusada pelo banco', () => {
    it('recusa o hash corrompido medido no banco local ("x")', async () => {
      await expect(bancoAceita(UserId.create().value, 'x')).resolves.toBe(false);
    });

    it('recusa a senha em claro', async () => {
      await expect(bancoAceita(UserId.create().value, 'senha-em-claro')).resolves.toBe(false);
    });

    it('recusa um id que não é uuid v7', async () => {
      await expect(
        bancoAceita('5e82103f-1ed2-4405-b099-ac2f5a08625b', CORPUS_DO_HASH[0]?.valor ?? ''),
      ).resolves.toBe(false);
    });

    it('aceita uma conta válida', async () => {
      await expect(
        bancoAceita(UserId.create().value, CORPUS_DO_HASH[0]?.valor ?? ''),
      ).resolves.toBe(true);
    });
  });

  describe('a regra do banco e a do value object não divergem', () => {
    it.each(CORPUS_DO_HASH.map((c) => [c.nome, c] as const))(
      'HASH — %s: o banco e o VO dizem o que a tabela espera',
      async (_nome, caso) => {
        const motivo = await motivoDaRecusa(UserId.create().value, caso.valor);
        expect(motivo === null).toBe(caso.banco);
        // E pela RAZÃO certa: uma recusa por `cast` não é a constraint
        // recusando, e um spec que aceitasse as duas mediria a constraint
        // onde ela não agiu.
        if (!caso.banco) {
          expect(motivo, `a recusa de "${caso.nome}" foi por "${motivo}"`).toBe(
            caso.motivo ?? 'constraint',
          );
        }
        expect(voAceitaHash(caso.valor)).toBe(caso.vo);
      },
    );

    it.each(CORPUS_DO_ID.map((c) => [c.nome, c] as const))(
      'ID — %s: o banco e o VO dizem o que a tabela espera',
      async (_nome, caso) => {
        const motivo = await motivoDaRecusa(caso.valor, CORPUS_DO_HASH[0]?.valor ?? '');
        expect(motivo === null).toBe(caso.banco);
        if (!caso.banco) {
          expect(motivo, `a recusa de "${caso.nome}" foi por "${motivo}"`).toBe(
            caso.motivo ?? 'constraint',
          );
        }
        expect(voAceitaId(caso.valor)).toBe(caso.vo);
      },
    );

    it('IMPLICAÇÃO (hash): o que o banco aceitou, o VO aceita — o 500 não volta', async () => {
      // O teste acima mede cada caso contra a tabela. Este mede a PROPRIEDADE
      // que fecha o buraco: não existe valor que o banco grave e a aplicação
      // não consiga ler. Sem ela, a tabela poderia estar errada nos dois lados
      // ao mesmo tempo e o spec ficaria verde.
      for (const caso of CORPUS_DO_HASH) {
        if (await bancoAceita(UserId.create().value, caso.valor)) {
          expect(
            voAceitaHash(caso.valor),
            `o banco aceitou "${caso.nome}" e o VO recusou — a listagem quebraria`,
          ).toBe(true);
        }
      }
    });

    it('IMPLICAÇÃO (id): o que o banco aceitou, o VO aceita — o 400 não volta', async () => {
      for (const caso of CORPUS_DO_ID) {
        if (await bancoAceita(caso.valor, CORPUS_DO_HASH[0]?.valor ?? '')) {
          expect(
            voAceitaId(caso.valor),
            `o banco aceitou "${caso.nome}" e o VO recusou — a listagem quebraria`,
          ).toBe(true);
        }
      }
    });

    it('a divergência declarada é na direção segura (o banco é mais estrito)', async () => {
      const divergentes = [...CORPUS_DO_HASH, ...CORPUS_DO_ID]
        .filter((c) => c.vo && !c.banco)
        .map((c) => c.nome);
      // A divergência é uma CLASSE, e não um caso: o banco recusa qualquer
      // `nome=número` além de `m`, `t` e `p` (o VO aceita), e o banco conta
      // o teto em BYTES enquanto o VO conta unidades UTF-16 (o banco recusa).
      // As duas classes são declaradas aqui pelo NOME — e a regra é de
      // CLASSE, para que um TERCEIRO membro de uma classe existente não
      // quebre o spec (ele não é uma divergência nova), e para que uma
      // divergência de uma classe INEXISTENTE apareça NOMEADA, e não como um
      // acidente silencioso.
      const foraDaClasse = divergentes.filter(
        (nome) => !CLASSES_DE_DIVERGENCIA.some((classe) => nome.startsWith(classe)),
      );
      expect(foraDaClasse, `divergência NÃO declarada: ${foraDaClasse.join(', ')}`).toEqual([]);
      for (const classe of CLASSES_DE_DIVERGENCIA) {
        expect(
          divergentes.some((nome) => nome.startsWith(classe)),
          `a classe de divergência "${classe}" sumiu do corpus`,
        ).toBe(true);
      }
    });
  });

  describe('o reparo do hash neutraliza a linha corrompida', () => {
    it('a linha que já estava corrompida deixa de violar a regra — e o VO volta a lê-la', async () => {
      // O banco de teste JÁ tem a constraint (o `migrate deploy` do helper a
      // aplicou). Para recriar a situação medida — uma linha corrompida que
      // existia ANTES da constraint — a constraint é derrubada primeiro.
      await ctx.prisma.$executeRawUnsafe(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS ${CONSTRAINT_DO_HASH}`,
      );

      const id = UserId.create().value;
      await ctx.prisma.user.create({
        data: { id, email: 'corrompido@teste.local', name: 'Corrompido', passwordHash: 'x' },
      });

      // O estado medido: o VO recusa o valor, e a listagem quebrava por causa
      // disso — não por causa do usuário.
      expect(voAceitaHash('x')).toBe(false);

      // O reparo: o arquivo REAL da migration, aplicado como o `migrate
      // deploy` aplicaria.
      const sql = await readFile(CAMINHOS_DAS_MIGRATIONS.hashReparo, 'utf8');
      await ctx.prisma.$executeRawUnsafe(sql);

      // O valor reparado é um envelope argon2id VÁLIDO (o VO aceita) — e não
      // um placeholder: um valor que o VO recusasse devolveria a listagem ao
      // estado quebrado de antes, com a constraint aplicada.
      const reparada = await ctx.prisma.user.findUnique({ where: { id } });
      expect(reparada).not.toBeNull();
      expect(voAceitaHash(reparada?.passwordHash ?? '')).toBe(true);

      // A conta NÃO passa a autenticar: o hash reparado não corresponde a
      // nenhuma senha, e `argon2.verify` devolve false para ele.
      const { Argon2PasswordHasher } =
        await import('../../../auth/infrastructure/security/argon2-password-hasher.js');
      const hasher = new Argon2PasswordHasher();
      await expect(hasher.verify('SenhaForte123', reparada?.passwordHash ?? '')).resolves.toBe(
        false,
      );
      await expect(hasher.verify('', reparada?.passwordHash ?? '')).resolves.toBe(false);
    });

    it('o reparo é idempotente (rodar de novo não altera nada)', async () => {
      await ctx.prisma.$executeRawUnsafe(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS ${CONSTRAINT_DO_HASH}`,
      );
      const id = UserId.create().value;
      await ctx.prisma.user.create({
        data: {
          id,
          email: 'corrompido2@teste.local',
          name: 'Corrompido',
          passwordHash: 'x',
        },
      });

      // A medida é a de linhas que VIOLAM a regra — não "hash diferente do
      // valor do corpus": o hash reparado é aleatório, e um count por
      // igualdade mediria a randomização, não o reparo.
      const invalidas = async (): Promise<number> => {
        const linhas = await ctx.prisma.$queryRaw<{ count: bigint }[]>`
          SELECT count(*)::bigint AS count
            FROM users
           WHERE NOT password_hash_is_valid_argon2id(password_hash)
        `;
        return Number(linhas[0]?.count ?? 0);
      };

      expect(await invalidas()).toBe(1);

      const sql = await readFile(CAMINHOS_DAS_MIGRATIONS.hashReparo, 'utf8');
      await ctx.prisma.$executeRawUnsafe(sql);
      expect(await invalidas()).toBe(0);

      const reparado = await ctx.prisma.user.findUnique({ where: { id } });
      await ctx.prisma.$executeRawUnsafe(sql);
      const reparadoDeNovo = await ctx.prisma.user.findUnique({ where: { id } });
      expect(reparadoDeNovo?.passwordHash).toBe(reparado?.passwordHash);
    });

    it('o reparo NÃO toca uma linha que já está válida', async () => {
      await ctx.prisma.$executeRawUnsafe(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS ${CONSTRAINT_DO_HASH}`,
      );
      const id = UserId.create().value;
      const valido = CORPUS_DO_HASH[1]?.valor ?? '';
      await ctx.prisma.user.create({
        data: { id, email: 'valido@teste.local', name: 'Válido', passwordHash: valido },
      });

      const sql = await readFile(CAMINHOS_DAS_MIGRATIONS.hashReparo, 'utf8');
      await ctx.prisma.$executeRawUnsafe(sql);

      const intacta = await ctx.prisma.user.findUnique({ where: { id } });
      expect(intacta?.passwordHash).toBe(valido);
    });
  });

  describe('o reparo do id dá um id novo à conta quebrada', () => {
    it('a conta com id v4 passa a ter um id v7 — e o VO volta a lê-la', async () => {
      await ctx.prisma.$executeRawUnsafe(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS ${CONSTRAINT_DO_ID}`,
      );

      const idV4 = '5e82103f-1ed2-4405-b099-ac2f5a08625b';
      await ctx.prisma.user.create({
        data: {
          id: idV4,
          email: 'id-velho@teste.local',
          name: 'Id Velho',
          passwordHash: CORPUS_DO_HASH[0]?.valor ?? '',
        },
      });
      expect(voAceitaId(idV4)).toBe(false);

      const sql = await readFile(CAMINHOS_DAS_MIGRATIONS.idReparo, 'utf8');
      await ctx.prisma.$executeRawUnsafe(sql);

      const reparada = await ctx.prisma.user.findUnique({
        where: { email: 'id-velho@teste.local' },
      });
      expect(reparada).not.toBeNull();
      expect(reparada?.id).not.toBe(idV4);
      expect(voAceitaId(reparada?.id ?? '')).toBe(true);

      // A conta sumiu do id antigo — foi TROCADA, não duplicada.
      await expect(ctx.prisma.user.findUnique({ where: { id: idV4 } })).resolves.toBeNull();
    });

    it('TUDO que aponta para a conta viaja com o id novo', async () => {
      await ctx.prisma.$executeRawUnsafe(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS ${CONSTRAINT_DO_ID}`,
      );

      // A conta que CRIA a outra: o `created_by` de uma linha é o id de outra
      // conta, e é uma referência solta (sem FK) — se ela não viajar, a linha
      // ficaria apontando para um id que não existe mais.
      const idDoCriador = 'f181c213-8b63-44e4-b388-5ea4e4464323';
      await ctx.prisma.user.create({
        data: {
          id: idDoCriador,
          email: 'criador@teste.local',
          name: 'Criador',
          passwordHash: CORPUS_DO_HASH[0]?.valor ?? '',
        },
      });

      const idV4 = '6be471e2-65d8-460b-acf6-0497c0cfff25';
      await ctx.prisma.user.create({
        data: {
          id: idV4,
          email: 'com-historico@teste.local',
          name: 'Com Histórico',
          passwordHash: CORPUS_DO_HASH[0]?.valor ?? '',
          createdBy: idDoCriador,
          updatedBy: idDoCriador,
          deletedBy: idDoCriador,
          deletedAt: new Date('2026-11-01T00:00:00.000Z'),
        },
      });
      await ctx.prisma.userHistory.create({
        data: {
          entityId: idV4,
          version: 1,
          operation: 'INSERT',
          snapshot: { id: idV4 },
          changedBy: idDoCriador,
        },
      });
      await ctx.prisma.userArchive.create({
        data: {
          entityId: idV4,
          version: 1,
          snapshot: { id: idV4 },
          deletedBy: idDoCriador,
        },
      });
      await ctx.prisma.idempotencyKey.create({
        data: {
          key: 'chave-de-rekey',
          actor: idV4,
          route: '/api/v1/users',
          fingerprint: 'dedalhe-da-requisição',
          status: 201,
          // ⚠️ O `response` é um ENVELOPE — `{ body, headers }` — e é o que a
          // aplicação grava (`prisma-idempotency.service.ts:154-163`). O id da
          // conta está em `body.id`. Um fixture com o `id` no TOPO mediria
          // um formato que a aplicação nunca escreve — e o reparo do id
          // passaria no fixture e falharia no dado real.
          response: {
            body: { id: idV4, email: 'com-historico@teste.local' },
            headers: { etag: 'W/"1"' },
          },
          expiresAt: new Date('2026-12-01T00:00:00.000Z'),
        },
      });

      const sql = await readFile(CAMINHOS_DAS_MIGRATIONS.idReparo, 'utf8');
      await ctx.prisma.$executeRawUnsafe(sql);

      const reparada = await ctx.prisma.user.findUnique({
        where: { email: 'com-historico@teste.local' },
      });
      const criador = await ctx.prisma.user.findUnique({
        where: { email: 'criador@teste.local' },
      });
      expect(reparada).not.toBeNull();
      expect(criador).not.toBeNull();

      // O histórico não tem FK (é uma referência solta por desenho), então a
      // migration o atualiza por conta própria — e se não fizesse, ele ficaria
      // apontando para um id que não existe mais.
      const historico = await ctx.prisma.userHistory.findMany({
        where: { entityId: reparada?.id ?? '' },
      });
      expect(historico).toHaveLength(1);
      // E o `id` DENTRO do snapshot — que é o que a API devolve em
      // `GET /users/{id}/history`. Um snapshot com o id VELHO é uma resposta
      // que cita uma conta que não existe mais.
      expect((historico[0]?.snapshot as { id?: string } | undefined)?.id).toBe(reparada?.id);
      expect(historico[0]?.changedBy).toBe(criador?.id);

      // O ARQUIVO de auditoria é a MESMA referência solta, em outra tabela — e
      // é a que o `GET /users/{id}/archive` devolve.
      const arquivo = await ctx.prisma.userArchive.findUnique({
        where: { entityId: reparada?.id ?? '' },
      });
      expect(arquivo).not.toBeNull();
      expect((arquivo?.snapshot as { id?: string } | undefined)?.id).toBe(reparada?.id);
      expect(arquivo?.deletedBy).toBe(criador?.id);

      // A chave de idempotência: o `actor` é o id da conta em TEXTO (e é
      // parte da PK), e o `response` é o ENVELOPE que a API devolve no replay
      // — com o id da conta em `body.id`.
      const chave = await ctx.prisma.idempotencyKey.findMany({
        where: { key: 'chave-de-rekey' },
      });
      expect(chave).toHaveLength(1);
      expect(chave[0]?.actor).toBe(reparada?.id);
      const envelope = chave[0]?.response as { body?: { id?: string } } | undefined;
      expect(envelope?.body?.id).toBe(reparada?.id);

      // As colunas de auditoria da própria conta também viajam — as TRÊS.
      const comCriador = await ctx.prisma.user.findUnique({
        where: { id: reparada?.id ?? '' },
      });
      expect(comCriador?.createdBy).toBe(criador?.id);
      expect(comCriador?.updatedBy).toBe(criador?.id);
      expect(comCriador?.deletedBy).toBe(criador?.id);

      // E o id VELHO não sobrou em NENHUMA das referências soltas: uma
      // referência que sobrou é um id que aponta para uma conta que não existe
      // mais — e o spec ficaria verde se medisse só o caminho feliz.
      await expect(ctx.prisma.userHistory.count({ where: { entityId: idV4 } })).resolves.toBe(0);
      await expect(ctx.prisma.userArchive.count({ where: { entityId: idV4 } })).resolves.toBe(0);
      await expect(ctx.prisma.idempotencyKey.count({ where: { actor: idV4 } })).resolves.toBe(0);
    });

    it('as referências COM FK viajam por ON UPDATE CASCADE (membership e refresh token)', async () => {
      await ctx.prisma.$executeRawUnsafe(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS ${CONSTRAINT_DO_ID}`,
      );

      const idV4 = '9c1f0d2e-3b4a-4c5d-8e6f-7a8b9c0d1e2f';
      await ctx.prisma.user.create({
        data: {
          id: idV4,
          email: 'com-fk@teste.local',
          name: 'Com FK',
          passwordHash: CORPUS_DO_HASH[0]?.valor ?? '',
        },
      });
      const empresa = await ctx.prisma.tenant.create({
        data: { name: 'Acme', slug: 'acme-do-rekey' },
      });
      await ctx.prisma.tenantMembership.create({
        data: { userId: idV4, tenantId: empresa.id },
      });
      await ctx.prisma.refreshToken.create({
        data: {
          jti: 'jti-do-rekey',
          userId: idV4,
          expiresAt: new Date('2026-12-01T00:00:00.000Z'),
        },
      });

      const sql = await readFile(CAMINHOS_DAS_MIGRATIONS.idReparo, 'utf8');
      await ctx.prisma.$executeRawUnsafe(sql);

      const reparada = await ctx.prisma.user.findUnique({
        where: { email: 'com-fk@teste.local' },
      });
      expect(reparada?.id).not.toBe(idV4);

      // A membership e o refresh token apontam para a conta por FK com
      // `ON UPDATE CASCADE` — o banco propaga sozinho. Se o cascade não
      // existisse, o reparo deixaria as duas linhas apontando para um id morto
      // (e o `ON DELETE CASCADE` apagaria a membership junto com a conta).
      const membership = await ctx.prisma.tenantMembership.findFirst({
        where: { tenantId: empresa.id },
      });
      expect(membership?.userId).toBe(reparada?.id);
      const token = await ctx.prisma.refreshToken.findUnique({ where: { jti: 'jti-do-rekey' } });
      expect(token?.userId).toBe(reparada?.id);
    });

    it('o reparo é idempotente (rodar de novo não altera nada)', async () => {
      await ctx.prisma.$executeRawUnsafe(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS ${CONSTRAINT_DO_ID}`,
      );
      await ctx.prisma.user.create({
        data: {
          id: '6be471e2-65d8-460b-acf6-0497c0cfff25',
          email: 'id-velho2@teste.local',
          name: 'Id Velho',
          passwordHash: CORPUS_DO_HASH[0]?.valor ?? '',
        },
      });

      const sql = await readFile(CAMINHOS_DAS_MIGRATIONS.idReparo, 'utf8');
      await ctx.prisma.$executeRawUnsafe(sql);
      const depois = await ctx.prisma.user.findUnique({
        where: { email: 'id-velho2@teste.local' },
      });
      const idDepois = depois?.id;

      await ctx.prisma.$executeRawUnsafe(sql);
      const final = await ctx.prisma.user.findUnique({ where: { email: 'id-velho2@teste.local' } });
      expect(final?.id).toBe(idDepois);
    });
  });

  describe('as funções são os donos das regras no banco', () => {
    it.each([['password_hash_is_valid_argon2id'], ['user_id_is_uuid_v7']])(
      'a função %s existe, é IMMUTABLE e devolve veredito binário',
      async (nome) => {
        const linhas = await ctx.prisma.$queryRaw<{ provolatile: string }[]>`
        SELECT p.provolatile::text AS provolatile
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = ${nome}
      `;
        expect(linhas).toHaveLength(1);
        // 'i' = IMMUTABLE. Sem isso, o Postgres recusa a CHECK constraint.
        expect(linhas[0]?.provolatile).toBe('i');
      },
    );

    it('a função do hash devolve o veredito do corpus', async () => {
      for (const caso of CORPUS_DO_HASH) {
        const linhas = await ctx.prisma.$queryRaw<{ valido: boolean }[]>`
          SELECT password_hash_is_valid_argon2id(${caso.valor}) AS valido
        `;
        expect(linhas[0]?.valido, `a função divergiu do esperado em "${caso.nome}"`).toBe(
          caso.banco,
        );
      }
    });

    it('a função do id devolve o veredito do corpus', async () => {
      for (const caso of CORPUS_DO_ID) {
        // ⚠️ Sem `::uuid`: a função recebe `text` (o mesmo domínio do VO) e
        // responde SIM ou NÃO para QUALQUER entrada. Com o parâmetro `uuid`,
        // um texto que não é uuid LEVANTA (`22P02`) em vez de devolver o
        // veredito — e um uuid sem hifens era canonicalizado e aceito, quando
        // o VO o recusa.
        const linhas = await ctx.prisma.$queryRaw<{ valido: boolean }[]>`
          SELECT user_id_is_uuid_v7(${caso.valor}) AS valido
        `;
        expect(linhas[0]?.valido, `a função divergiu do esperado em "${caso.nome}"`).toBe(
          caso.banco,
        );
      }
    });

    it('a função do id recusa a forma NÃO canônica (uuid sem hifens)', async () => {
      // O Postgres canonicaliza o que entra na coluna `uuid` — e o VO exige os
      // hifens. A função recebe o texto CRU, então precisa recusar a forma
      // não canônica: senão ela aceitaria algo que o VO recusa (a direção
      // perigosa).
      const linhas = await ctx.prisma.$queryRaw<{ valido: boolean }[]>`
        SELECT user_id_is_uuid_v7('01a1e5f862f47d5fb8f8bcb72367da9b') AS valido
      `;
      expect(linhas[0]?.valido).toBe(false);
    });

    it('a função do id devolve false (e não NULL) para um valor que não é uuid', async () => {
      // `NULL` em uma CHECK constraint significa "a linha PASSA" — a regra tem
      // de ser binária.
      const linhas = await ctx.prisma.$queryRaw<{ valido: boolean | null }[]>`
        SELECT user_id_is_uuid_v7(NULL::text) AS valido
      `;
      expect(linhas[0]?.valido).toBe(false);
    });
  });

  describe('as constraints voltam a ser aplicadas depois dos reparos', () => {
    it('a constraint do hash e a do id são reaplicadas pelos arquivos das migrations', async () => {
      // Este bloco é o que fecha o ciclo: as constraints que os reparos
      // derrubaram voltam, e o banco volta a recusar a escrita inválida.
      await ctx.prisma.$executeRawUnsafe(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS ${CONSTRAINT_DO_HASH}`,
      );
      await ctx.prisma.$executeRawUnsafe(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS ${CONSTRAINT_DO_ID}`,
      );

      await ctx.prisma.$executeRawUnsafe(
        await readFile(CAMINHOS_DAS_MIGRATIONS.hashConstraint, 'utf8'),
      );
      await ctx.prisma.$executeRawUnsafe(
        await readFile(CAMINHOS_DAS_MIGRATIONS.idConstraint, 'utf8'),
      );

      await expect(bancoAceita(UserId.create().value, 'x')).resolves.toBe(false);
      await expect(
        bancoAceita('5e82103f-1ed2-4405-b099-ac2f5a08625b', CORPUS_DO_HASH[0]?.valor ?? ''),
      ).resolves.toBe(false);
    });
  });
});
