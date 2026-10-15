// apps/api/src/modules/auth/infrastructure/security/argon2-password-hasher.spec.ts
//
// Testa o adaptador argon2 real (não um mock do `argon2`) — é a única
// forma de provar que o formato emitido casa com a regra do `PasswordHash`
// VO, que é a barreira que impede a senha em claro de ir para
// `users.password_hash`.
//
// ⚠️ argon2id com m=65536,t=3,p=4 medido em ~48 ms por hash neste
// ambiente. A suíte abaixo faz ~8 hashes, ou seja ~400 ms. É o preço de
// não medir um mock; o comentário existe para ninguém "otimizar" o
// arquivo trocando argon2 por stub depois de um CI lento.
//
// ── POR QUE `verify` NÃO PODE LANÇAR ──────────────────────────────────────
//
// O contrato do port diz isso, mas a consequência é de segurança: se
// `verify` LANÇASSE num hash corrompido, o fluxo de login responderia 500
// nesse caso e o chamador conseguiria distinguir "e-mail não existe",
// "senha errada" (401) de "registro corrompido" (500) — que é exatamente a
// enumeração de contas que o `InvalidCredentialsException` genérico existe
// para impedir. Um hash inválido no banco é um dado ruim; a resposta
// correta para dado ruim no login é a MESMA resposta do login normal.
//
// Por isso os casos de hash malformado abaixo esperam `resolves.toBe(false)`:
// um `rejects` reprovaria a spec.

import { describe, it, expect } from 'vitest';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';
import { PasswordHash } from '../../../users/domain/value-objects/password-hash.vo.js';
import type { PasswordHasherPort } from '../../../users/domain/ports/password-hasher.port.js';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('é um PasswordHasherPort (checagem de tipo em tempo de compilação)', () => {
    // A atribuição abaixo É o teste: se a classe deixar de implementar o
    // port, o `tsc --noEmit` falha — e o typecheck roda antes da suíte.
    const port: PasswordHasherPort = hasher;
    expect(typeof port.hash).toBe('function');
    expect(typeof port.verify).toBe('function');
  });

  describe('hash()', () => {
    it('devolve algo que o PasswordHash VO aceita', async () => {
      const hash = await hasher.hash('senha-de-teste');

      // pt-BR: `expect(hash).toMatch(/^\$argon2id$/)` passaria mesmo que o
      // VO estivesse errado. É `PasswordHash.create` que mede a mesma
      // regra que `User.criar` vai aplicar — então o VO que decide.
      expect(() => PasswordHash.create(hash)).not.toThrow();
    });

    it('usa argon2id v=19 (não argon2i, nem a variante fraca v=0x10)', async () => {
      const hash = await hasher.hash('senha-de-teste');

      expect(hash.startsWith('$argon2id$v=19$')).toBe(true);
    });

    it('atinge o PISO de custo, não os parâmetros literais de hoje', async () => {
      // Fixar `m=65536,t=3,p=4` no spec transformaria a política do hasher
      // em constante de teste: mudar os parâmetros (que o próprio código
      // prevê, via `argon2.needsRehash`) quebraria o teste em vez de
      // obrigar uma decisão consciente. O que este teste trava é o
      // PISO: um argon2id "barato" (m=8, o que o bcrypt faz) continua
      // sendo argon2id e passaria num teste de formato.
      const hash = await hasher.hash('senha-de-teste');
      // `$argon2id$v=19$m=65536,p=4,t=3$<salt>$<digest>` → split('$') dá
      // ['', 'argon2id', 'v=19', 'm=65536,p=4,t=3', salt, digest].
      const [, tipo, versao, parametros] = hash.split('$');
      expect(tipo).toBe('argon2id');
      expect(versao).toMatch(/^v=\d+$/);

      // `m=65536,p=4,t=3` → tira o prefixo de 2 chars de CADA par, depois
      // converte. O `.slice(2)` na string inteira (antes do split) cortaria
      // também o "6" de 65536 e mediria 536 — que é o tipo de bug que faz
      // um teste de segurança passar com um piso errado.
      const [memoria, paralelismo, tempo] = (parametros ?? '')
        .split(',')
        .map((par) => Number(par.slice(2)));
      expect(memoria).toBeGreaterThanOrEqual(65_536); // 64 MiB
      expect(tempo).toBeGreaterThanOrEqual(3);
      expect(paralelismo).toBeGreaterThanOrEqual(1);
    });

    it('é determinístico no VERIFY, não no hash: dois hashes da mesma senha diferem', async () => {
      const a = await hasher.hash('mesma-senha');
      const b = await hasher.hash('mesma-senha');

      // pt-BR: o salt é aleatório por hash. Se dois hashes fossem iguais,
      // a tabela viraria rainbow-table trivial e o ganho do argon2 sumiria.
      expect(a).not.toBe(b);
      expect(await hasher.verify('mesma-senha', a)).toBe(true);
      expect(await hasher.verify('mesma-senha', b)).toBe(true);
    });

    it('NÃO embute a senha em claro em nenhum ponto do hash', async () => {
      const hash = await hasher.hash('senha-de-teste-123');

      expect(hash).not.toContain('senha-de-teste-123');
    });
  });

  describe('verify()', () => {
    it('aceita a senha correta', async () => {
      const hash = await hasher.hash('senha-correta-123');
      await expect(hasher.verify('senha-correta-123', hash)).resolves.toBe(true);
    });

    it('rejeita a senha errada', async () => {
      const hash = await hasher.hash('senha-correta-123');
      await expect(hasher.verify('senha-errada-123', hash)).resolves.toBe(false);
    });

    it('rejeita senha errada que é prefixo da senha real', async () => {
      // `argon2.verify` compara o digest inteiro; um `startsWith` ingênuo
      // aceitaria "senha-correta-1" para "senha-correta-123".
      const hash = await hasher.hash('senha-correta-123');

      await expect(hasher.verify('senha-correta-1', hash)).resolves.toBe(false);
    });

    // ── hash malformado: RESOLVE false, NUNCA lança ────────────────────────
    it.each([
      ['texto solto', 'nao-e-um-hash-argon2'],
      ['string vazia', ''],
      ['só espaços', '   '],
      ['argon2id sem o campo de parâmetros', '$argon2id$v=19$abcdefgh'],
      ['argon2id com digest vazio', '$argon2id$v=19$m=65536,p=4,t=3$c2FsdA$'],
      ['argon2id truncado', '$argon2id$v=19$m=65536,p=4,t=3$c2FsdA'],
      [
        'hash de bcrypt (outro algoritmo)',
        '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
      ],
      ['prefixo argon2id colado num lixo', '$argon2id$v=19$m=65536,p=4,t=3$c2FsdA$!!!!'],
    ])('devolve false (não lança) para hash corrompido: %s', async (_caso, hash) => {
      await expect(hasher.verify('senha', hash)).resolves.toBe(false);
    });

    it('devolve false quando o banco devolveu null no lugar do hash', async () => {
      // Um `null` vindo do driver (coluna NULL) chega aqui apesar do tipo
      // `string` — em runtime não existe tipagem. Um `argon2.verify(null)`
      // cru lança `TypeError`, e essa exceção vazaria como 500 no login.
      const resultado = await (
        hasher.verify as unknown as (s: string, h: unknown) => Promise<boolean>
      )('senha', null);

      expect(resultado).toBe(false);
    });

    it('devolve false para senha vazia contra hash válido', async () => {
      const hash = await hasher.hash('senha-correta-123');
      await expect(hasher.verify('', hash)).resolves.toBe(false);
    });
  });
});
