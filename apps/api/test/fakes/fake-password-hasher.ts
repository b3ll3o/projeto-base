// apps/api/test/fakes/fake-password-hasher.ts
//
// Double de `PasswordHasherPort` para os specs que instanciam `UserUseCases`
// diretamente (unit e integration). A implementação real — argon2 — é da Fase 4
// (`src/modules/auth/infrastructure/security/argon2-password-hasher.ts`).
//
// Vive em `test/` (e não em `src/`) por dois motivos: `**/test/**` está no
// `coverage.exclude` do config raiz, então um double não entra no denominador
// de cobertura; e um hasher de mentira em `src/` seria um caminho de produção
// capaz de gravar senha em claro.

import type { PasswordHasherPort } from '../../src/modules/users/domain/ports/password-hasher.port.js';

/**
 * Hash argon2id real nos parâmetros que a lib usa por default
 * (`argon2.hash` com `type: argon2id`, MEDIDO 48 ms neste ambiente).
 *
 * O VO rejeita qualquer coisa que não corresponda ao formato argon2id, então
 * um "hash" inventado tipo `'hashed'` faria `PasswordHash.create` lançar e o
 * defeito apareceria como erro de VO em vez do que o spec está medindo. É o
 * mesmo valor usado nos specs do VO e do agregado.
 */
export const HASH_REAL =
  '$argon2id$v=19$m=65536,p=4,t=3$tIPgD9G6KLb3ipQtztNpzA$gHYfsfbFSsrBYY5GrY1epCkDyr/BaVsWnjVptgogwng';

/**
 * Senha em claro válida para a política (8..72) — usada nos specs.
 */
export const SENHA_VALIDA = 'senha-super-secreta';

/**
 * `FakePasswordHasher` — devolve sempre o MESMO hash e registra a senha em
 * claro que recebeu.
 *
 * A lista `senhasEmClaro` é a instrumentação que permite ao spec afirmar duas
 * coisas distintas, e é por isso que ela existe em vez de o double simplesmente
 * devolver uma constante:
 *
 *  1. que `criarUser` CHAMOU o hasher com a senha do cliente;
 *  2. que essa senha não apareceu em nenhum OUTRO argumento capturado — nem no
 *     agregado, nem no `save`, nem no snapshot de auditoria.
 *
 * `verify` responde "esta senha em claro já foi hasheada por mim?". Não é
 * argon2 e não pretende ser: é truthy apenas para o que este double viu, o
 * que o torna honesto como double (nunca aprova uma senha que ele não hasheou).
 * A Fase 4 troca isto pelo `argon2.verify` de verdade.
 */
export class FakePasswordHasher implements PasswordHasherPort {
  /** Toda senha em claro que passou por `hash()`, em ordem. */
  readonly senhasEmClaro: string[] = [];

  /** Quantas vezes `hash` foi chamado — distingue "não hasheou" de "hasheou vazio". */
  hashCalls = 0;

  async hash(senhaPlana: string): Promise<string> {
    this.hashCalls += 1;
    this.senhasEmClaro.push(senhaPlana);
    return HASH_REAL;
  }

  async verify(senhaPlana: string, _hashArmazenado: string): Promise<boolean> {
    return this.senhasEmClaro.includes(senhaPlana);
  }

  /** Zera o registro — para um spec que quer medir só um trecho. */
  reset(): void {
    this.senhasEmClaro.length = 0;
    this.hashCalls = 0;
  }
}

/**
 * Serializa um valor arbitrário para busca por substring, cobrindo tanto
 * `JSON.stringify` quanto a interpolação de template (`${vo}`), que passa por
 * `toString()`.
 *
 * Usado pelo spec que afirma que a senha em claro não aparece em nenhum
 * argumento capturado pelo mock — um `expect(x).not.toBe(senha)` só olha um
 * campo; o defeito real aparecia em algum lugar que ninguém estava olhando.
 */
export function stringifyParaBusca(valor: unknown): string {
  try {
    return `${String(valor)} ${JSON.stringify(valor) ?? ''}`;
  } catch {
    return String(valor);
  }
}
