// apps/api/src/modules/users/domain/value-objects/password-hash.vo.spec.ts
//
// O `PasswordHash` é o VO que segura a senha — e a primeira regra dele é
// que a senha não sai. Estes testes existem para travar essa regra em duas
// frentes independentes:
//
//  1. O segredo não sai por NENHUM caminho de serialização. São dois
//     mecanismos diferentes, e é essa a parte que o arquivo antigo
//     nomeava sem medir (ver "MEDIDO 2026-10-13" abaixo):
//       a. `toString()` devolve `[redacted]` → cobre template e `String()`.
//          ⚠️ NÃO cobre `console.log(h)`: MEDIDO, o Node usa `util.inspect`
//          num objeto e imprime `PasswordHash {}`. Sai seguro, mas por (b).
//       b. o dado mora em `#value` e `value` é um getter de prototype →
//          cobre `JSON.stringify`, `util.inspect`, spread, `Object.assign`.
//     Os quatro últimos NÃO passam por `toString()`: leem own properties.
//     MEDIDO: antes, `JSON.stringify(h)` devolvia o hash INTEIRO.
//     A segunda barreira é `toUserOutput` não ler o campo;
//     `user.output.spec.ts` cobre essa.
//
//  2. `create()` recusa o que NÃO é hash argon2id. Sem isto, um
//     `PasswordHash.create(senhaPlana)` passaria: a senha plana é uma
//     string não-vazia, e `verify()` depois devolveria `false` para
//     todo mundo — o sintoma seria "login sempre falha", que é a forma
//     mais cara de descobrir que o cadastro gravou a senha em claro.
//
// MEDIDO 2026-10-08: os VOs `Email`/`UserName` lançavam `Error` puro, que o
// `mapExceptionToHttp` não reconhece e converte em 500. Aqui o mesmo cuidado:
// o alvo das asserções é o TIPO e o NOME da exceção, não uma palavra na
// mensagem.

import { describe, it, expect } from 'vitest';
import { inspect } from 'node:util';
import { PasswordHash, MIN_LENGTH, MAX_LENGTH } from './password-hash.vo.js';
import { UserValidationException } from '../exceptions/user.exceptions.js';

/**
 * Hash argon2id REAL nos parâmetros que a lib usa por default
 * (`m=65536, p=4, t=3`), 97 chars. Gerado por
 * `argon2.hash('senha-de-teste-do-spec', { type: argon2id })`.
 *
 * ⚠️ A senha é CONHECIDA e está escrita aqui de propósito: este é um
 * fixture de teste, e o hash dele não protege nada — ele existe para
 * exercitar o VO, não para simular um segredo.
 *
 * Deliberadamente DIFERENTE do hash de backfill de
 * `prisma/migrations/20261009000000_user_password_hash/migration.sql`. As
 * duas coisas eram byte-idênticas, o que é uma armadilha: rotacionar o
 * backfill (a prática correta) deixaria este spec falhando sem que nada
 * aqui tivesse a ver com a mudança, e alguém "corrigiria" o spec
 * colando o hash novo de volta. Dois arquivos de texto livre não têm
 * ligação nenhuma — e o comentário antigo ("gerado com argon2.hash(...)")
 * induzia a ler este fixture como hash de senha de teste quando ele era,
 * na verdade, o hash do segredo aleatório do backfill.
 */
const HASH_REAL =
  '$argon2id$v=19$m=65536,p=4,t=3$J44jLmMJtt8G/XqkZPHYvw$Rcrvt5L6qcKGn7pGzs24Vd3sEgXO6opF59XFUlcALoY';

/**
 * O SALT deste hash. É o marcador que os testes de vazamento procuram:
 * se ele aparece numa saída, o segredo inteiro apareceu com ele.
 */
const SALT = 'J44jLmMJtt8G/XqkZPHYvw';

/** `true` se `create()` aceitou o valor. */
const aceita = (raw: string): boolean => {
  try {
    PasswordHash.create(raw);
    return true;
  } catch {
    return false;
  }
};

describe('PasswordHash', () => {
  describe('create()', () => {
    it('aceita um hash argon2id real e preserva o valor', () => {
      const h = PasswordHash.create(HASH_REAL);
      expect(h.value).toBe(HASH_REAL);
    });

    it('recusa string vazia', () => {
      expect(() => PasswordHash.create('')).toThrow(UserValidationException);
    });

    it('recusa string em branco', () => {
      expect(() => PasswordHash.create('   ')).toThrow(UserValidationException);
    });

    // A senha PLANA é o erro que este VO existe para impedir. Ela é uma
    // string não-vazia e por isso passaria num VO que só checasse
    // "não está vazio" — e o defeito só apareceria no login, como
    // "credencial inválida" para sempre.
    it('recusa a SENHA PLANA (string não-vazia que não é hash argon2id)', () => {
      expect(() => PasswordHash.create('senha-super-secreta')).toThrow(UserValidationException);
    });

    it('recusa bcrypt ($2b$…) — o formato anterior do projeto', () => {
      expect(() =>
        PasswordHash.create('$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'),
      ).toThrow(UserValidationException);
    });

    it('recusa argon2i e argon2d — só argon2id é aceito', () => {
      const semAlgoritmo = HASH_REAL.replace('$argon2id$', '');
      expect(aceita(`$argon2i$${semAlgoritmo}`)).toBe(false);
      expect(aceita(`$argon2d$${semAlgoritmo}`)).toBe(false);
    });

    it('recusa hash argon2id sem o digest final', () => {
      expect(aceita('$argon2id$v=19$m=65536,p=4,t=3$c2FsdA$')).toBe(false);
    });

    it('lança UserValidationException (não Error puro) — o 500 que a validação evita', () => {
      let capturada: unknown;
      try {
        PasswordHash.create('senha-plana');
      } catch (e) {
        capturada = e;
      }
      expect(capturada).toBeInstanceOf(UserValidationException);
      // O NOME é o que o `mapExceptionToHttp` casa: `instanceof Error`
      // sozinho não distingue a subclasse do tipo base.
      expect((capturada as Error).name).toBe('UserValidationException');
      expect((capturada as UserValidationException).campo).toBe('senhaHash');
    });

    it('a mensagem não repete o nome da classe nem a sintaxe do VO', () => {
      let capturada: UserValidationException | undefined;
      try {
        PasswordHash.create('senha-plana');
      } catch (e) {
        capturada = e as UserValidationException;
      }
      expect(capturada?.message).not.toMatch(/UserValidationException|PasswordHash\.create/);
    });

    // ── ORDEM DOS PARÂMETROS: QUALQUER, NÃO SÓ UMA ──────────────────────
    //
    // O regex antigo era `m=\d+,p=\d+,t=\d+`, que amarrava a ordem que a
    // node-argon2 0.45.1 emite. A ordem CANÔNICA do formato PHC é
    // `m=,t=,p=`, e MEDIDO: um hash argon2id válido nessa ordem era
    // RECUSADO com "formato inválido" — no login, isso aparece como senha
    // inválida. Um hash migrado de outro sistema, ou produzido pela
    // implementação C de referência, é exatamente o caso que quebrava.
    it('aceita m=,t=,p= — a ordem canônica do PHC (a que o regex antigo recusava)', () => {
      expect(aceita('$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$ZGluZXN0')).toBe(true);
    });

    it('aceita m=,p=,t= — a ordem que a node-argon2 emite', () => {
      expect(aceita('$argon2id$v=19$m=65536,p=4,t=3$c2FsdA$ZGluZXN0')).toBe(true);
    });

    it('aceita qualquer outra ordem dos três parâmetros', () => {
      expect(aceita('$argon2id$v=19$t=3,p=4,m=65536$c2FsdA$ZGluZXN0')).toBe(true);
      expect(aceita('$argon2id$v=19$p=4,m=65536,t=3$c2FsdA$ZGluZXN0')).toBe(true);
    });

    // O ponto do desacoplamento é NÃO fixar os VALORES: quem decide os
    // parâmetros é o hasher, não o VO. Fixar `m=65536` faria o VO rejeitar
    // um hash válido gerado com memória maior, e a custo de recomputar
    // tudo quando a política mudar.
    it('não fixa os valores dos parâmetros (qualquer m/t/p numérico passa)', () => {
      expect(aceita('$argon2id$v=19$m=1048576,t=16,p=1$c2FsdA$ZGluZXN0')).toBe(true);
      expect(aceita('$argon2id$v=16$m=4096,t=1,p=1$c2FsdA$ZGluZXN0')).toBe(true);
    });

    it('ainda exige os TRÊS parâmetros, não só a ordem certa', () => {
      // `t=` faltando, `m=` faltando, `p=` faltando.
      expect(aceita('$argon2id$v=19$m=65536,p=4$c2FsdA$ZGluZXN0')).toBe(false);
      expect(aceita('$argon2id$v=19$t=3,p=4$c2FsdA$ZGluZXN0')).toBe(false);
      expect(aceita('$argon2id$v=19$m=65536,t=3$c2FsdA$ZGluZXN0')).toBe(false);
    });

    it('recusa bloco de parâmetros malformado (não-numérico, repetido, vazio)', () => {
      expect(aceita('$argon2id$v=19$m=65536,t=abc,p=4$c2FsdA$ZGluZXN0')).toBe(false);
      expect(aceita('$argon2id$v=19$m=1,m=2,t=3$c2FsdA$ZGluZXN0')).toBe(false);
      expect(aceita('$argon2id$v=19$m=65536,,t=3$c2FsdA$ZGluZXN0')).toBe(false);
      expect(aceita('$argon2id$v=19$m=,t=3,p=4$c2FsdA$ZGluZXN0')).toBe(false);
    });

    // ── TETO DE TAMANHO ─────────────────────────────────────────────────
    //
    // `[^$]+` não tinha teto. MEDIDO: um digest de 5 MiB passava no regex,
    // ia para `users.password_hash` (coluna TEXT sem limite) e era
    // reparseado pelo `argon2.verify` a cada tentativa de login.
    //
    // O número é literal de propósito: se o `TAMANHO_MAXIMO` do VO subir sem
    // revisão, este teste fica vermelho em vez de acompanhar em silêncio.
    it('recusa hash acima de 512 caracteres (o teto do VO)', () => {
      const prefixo = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$';
      const grande = `${prefixo}${'A'.repeat(513 - prefixo.length)}`;
      expect(grande.length).toBe(513);
      expect(aceita(grande)).toBe(false);
    });

    it('aceita hash de exatamente 512 caracteres — o teto não é off-by-one', () => {
      const prefixo = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$';
      const noTeto = `${prefixo}${'A'.repeat(512 - prefixo.length)}`;
      expect(noTeto.length).toBe(512);
      expect(aceita(noTeto)).toBe(true);
    });

    it('recusa digest de 5 MiB — o caso medido do achado A-06', () => {
      expect(aceita(`$argon2id$v=19$m=65536,p=4,t=3$c2FsdA$${'A'.repeat(5 * 1024 * 1024)}`)).toBe(
        false,
      );
    });

    // 512 é folgado: o pior argon2id razoável (parâmetros no máximo de
    // 32 bits + salt de 64 bytes + digest de 64 bytes) dá ~230 chars.
    // Este teste é o que impede alguém de baixar o teto para "economizar".
    it('o teto não rejeita nenhum argon2id legítimo de digest grande', () => {
      const prefixo = '$argon2id$v=19$m=4294967295,t=4294967295,p=4294967295$';
      const hashGrande = `${prefixo}${'A'.repeat(64)}$${'B'.repeat(86)}`;
      expect(hashGrande.length).toBeLessThan(512);
      expect(aceita(hashGrande)).toBe(true);
    });

    it('o hash argon2id real cabe folgadamente no teto', () => {
      expect(HASH_REAL.length).toBeLessThan(512);
    });

    // ── MIN_LENGTH/MAX_LENGTH NÃO são o tamanho do hash ──────────────────
    //
    // `MIN_LENGTH`/`MAX_LENGTH` exportados deste arquivo são a POLÍTICA DE
    // SENHA em claro (o que o `CreateUserSchema` valida no boundary), não
    // o tamanho do hash — um argon2id real tem ~97 chars, ACIMA de
    // `MAX_LENGTH = 72`. Se alguém aplicar estes números ao hash, TODO hash
    // real passa a ser recusado e o cadastro inteiro quebra com 400.
    //
    // Este teste é o que impede essa leitura errada: ele afirma que um hash
    // de comprimento MAIOR que `MAX_LENGTH` é aceito.
    it('aceita hash argon2id real MESMO com comprimento > MAX_LENGTH', () => {
      expect(HASH_REAL.length).toBeGreaterThan(MAX_LENGTH);
      expect(() => PasswordHash.create(HASH_REAL)).not.toThrow();
    });

    it('os limites exportados são a política de senha em claro (8..72)', () => {
      expect(MIN_LENGTH).toBe(8);
      expect(MAX_LENGTH).toBe(72);
      expect(MIN_LENGTH).toBeLessThan(MAX_LENGTH);
    });
  });

  describe('redação — a primeira barreira contra vazamento', () => {
    it('toString() devolve [redacted]', () => {
      const h = PasswordHash.create(HASH_REAL);
      expect(h.toString()).toBe('[redacted]');
    });

    it('toString() NÃO contém o hash', () => {
      const h = PasswordHash.create(HASH_REAL);
      expect(h.toString()).not.toContain(h.value);
      expect(h.toString()).not.toContain('$argon2id$');
      expect(h.toString()).not.toContain(SALT);
    });

    // ── Coerção: o caminho que `toString()` cobre ───────────────────────
    //
    // Estes dois SÃO cobertos pelo `toString()`, e já eram. O que faltava
    // era o resto — a serialização estrutural, abaixo.
    it('template string e String() são redigidos', () => {
      const h = PasswordHash.create(HASH_REAL);
      expect(`${h}`).toBe('[redacted]');
      expect(String(h)).toBe('[redacted]');
      expect(`${h}`).not.toContain(SALT);
    });

    // ── Serialização estrutural: o caminho que `toString()` NÃO cobre ───
    //
    // MEDIDO 2026-10-13. Com `public readonly value`, estes quatro
    // imprimiam o hash INTEIRO, porque leem own properties enumeráveis e
    // não passam por `toString()`:
    //     JSON.stringify(h)  -> {"value":"$argon2id$v=19$m=…$SALT$DIGEST"}
    //     util.inspect(h)    -> PasswordHash { value: '$argon2id$…' }
    //     {...h}             -> { value: '$argon2id$…' }
    // O título antigo deste teste prometia `JSON.stringify` e nenhuma linha
    // do corpo o exercitava — a suíte ficava verde com o vazamento aberto
    // E ficaria verde idêntica com ele fechado.
    //
    // Hoje o dado vive em `#value` e `value` é um getter de prototype, que
    // não é own property de instância.
    it('JSON.stringify(h) NÃO carrega o hash', () => {
      const h = PasswordHash.create(HASH_REAL);
      const saida = JSON.stringify(h);
      expect(saida).not.toContain(SALT);
      expect(saida).not.toContain('$argon2id$');
    });

    it('JSON.stringify({ senhaHash: h }) — o VO aninhado, como no aggregate — NÃO carrega o hash', () => {
      const senhaHash = PasswordHash.create(HASH_REAL);
      const saida = JSON.stringify({ senhaHash });
      expect(saida).not.toContain(SALT);
      expect(saida).not.toContain('$argon2id$');
    });

    it('util.inspect(h) — o caminho do console.log — NÃO carrega o hash', () => {
      const h = PasswordHash.create(HASH_REAL);
      const saida = inspect(h);
      expect(saida).not.toContain(SALT);
      expect(saida).not.toContain('$argon2id$');
    });

    it('spread {...h} NÃO carrega o hash', () => {
      const h = PasswordHash.create(HASH_REAL);
      const saida = JSON.stringify({ ...h });
      expect(saida).not.toContain(SALT);
      expect(saida).not.toContain('$argon2id$');
    });

    it('Object.assign({}, h) NÃO carrega o hash', () => {
      const h = PasswordHash.create(HASH_REAL);
      const saida = JSON.stringify(Object.assign({}, h));
      expect(saida).not.toContain(SALT);
      expect(saida).not.toContain('$argon2id$');
    });

    // O caminho do `console.log(h)`. MEDIDO 2026-10-13: o Node NÃO usa
    // `toString()` num objeto — usa `util.inspect` e imprime
    // `PasswordHash {}`. Ou seja: seguro, mas por (b), não pela redação.
    // O teste fixa o resultado (que é o que importa) e não o mecanismo.
    it('console.log(h) NÃO carrega o hash', () => {
      const h = PasswordHash.create(HASH_REAL);
      // `util.inspect` é o que o `console.log` aplica a um objeto.
      const saida = inspect(h);
      expect(saida).not.toContain(SALT);
      expect(saida).not.toContain('$argon2id$');
    });

    // O MECANISMO, afirmado diretamente. Sem este teste, um futuro
    // "simplificação" que troque `#value` por um campo público voltaria a
    // vazar sem nenhum dos testes acima reclamar na hora — eles medem o
    // sintoma; este mede a causa.
    //
    // ⚠️ Este teste afirma ENUMERABILIDADE, não "não existe property".
    // MEDIDO: com um campo público tornado non-enumerable por
    // `Object.defineProperty` (o caminho alternativo que fecha o mesmo
    // vazamento), `Object.getOwnPropertyNames` ainda devolve `['value']` e
    // um teste que exigisse lista vazia rejeitaria um conserto legítimo.
    // O nome do campo não é segredo — só o VALOR é. O que o
    // `JSON.stringify`/spread/`inspect` leem é a lista ENUMERÁVEL, e é
    // ela que precisa estar vazia.
    it('o segredo NÃO é uma own property enumerável da instância', () => {
      const h = PasswordHash.create(HASH_REAL);
      expect(Object.keys(h)).toEqual([]);
      expect({ ...h }).toEqual({});
    });

    it('a API pública de leitura continua funcionando (getter no prototype)', () => {
      const h = PasswordHash.create(HASH_REAL);
      expect(h.value).toBe(HASH_REAL);
      expect(typeof h.value).toBe('string');
      expect('value' in h).toBe(true);
    });
  });

  describe('imutabilidade e identidade', () => {
    it('equals compara por valor', () => {
      expect(PasswordHash.create(HASH_REAL).equals(PasswordHash.create(HASH_REAL))).toBe(true);
    });

    it('equals retorna false para hashes diferentes', () => {
      const outro = '$argon2id$v=19$m=65536,p=4,t=3$outroSaltQualquer$outroDigestQualquer';
      expect(PasswordHash.create(HASH_REAL).equals(PasswordHash.create(outro))).toBe(false);
    });

    it('equals(null/undefined) retorna false, não lança', () => {
      const h = PasswordHash.create(HASH_REAL);
      expect(h.equals(null)).toBe(false);
      expect(h.equals(undefined)).toBe(false);
    });

    // Ler `#value` de um objeto que não é `PasswordHash` lança TypeError.
    // Um `equals` que lança é pior do que um que devolve `false`.
    it('equals com um objeto que imita o shape (só `value`) devolve false, não lança', () => {
      const h = PasswordHash.create(HASH_REAL);
      const impostor = { value: HASH_REAL } as unknown as PasswordHash;
      expect(() => h.equals(impostor)).not.toThrow();
      expect(h.equals(impostor)).toBe(false);
    });

    it('congelado (imutável)', () => {
      expect(Object.isFrozen(PasswordHash.create(HASH_REAL))).toBe(true);
    });
  });
});
