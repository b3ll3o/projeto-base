// apps/api/src/shared/infrastructure/prisma/assinatura-de-membership.spec.ts
//
// pt-BR (Fase 10+ — RLS, 2026-10-17): o contrato de fail-fast da assinatura.
//
// O QUE ESTE ARQUIVO PROVA E O DE INTEGRAÇÃO NÃO PROVE
// `prisma-rls.integration.spec.ts` e
// `prisma-tenant-onboarding.repository.integration.spec.ts` exercitam o
// caminho FELIZ com banco de verdade: a chave existe, tem 32 bytes, e a
// assinatura casa. O que eles não exercitam — e é o que dói em produção — é o
// caminho em que a aplicação NÃO SOBE, porque a chave não pôde ser lida.
//
// A escolha de design aqui é falhar no boot, não no primeiro onboarding. O
// custo de errar é assimétrico: chave faltando adiada vira um 500 em produção
// no primeiro cadastro de empresa, com um stack trace que aponta para o
// `$queryRaw` e não para a causa. Estes testes travam a decisão.

import { describe, it, expect, afterEach } from 'vitest';
import { AssinaturaDeMembership, corpoDaAssinatura } from './assinatura-de-membership.js';

describe('AssinaturaDeMembership (Fase 10+)', () => {
  const urlOriginal = process.env['DIRECT_DATABASE_URL'];

  afterEach(() => {
    if (urlOriginal === undefined) delete process.env['DIRECT_DATABASE_URL'];
    else process.env['DIRECT_DATABASE_URL'] = urlOriginal;
  });

  describe('corpoDaAssinatura', () => {
    it('o corpo é o MESMO que a migration monta, contagem de bytes incluída', () => {
      // ⚠️ Este é o contrato byte a byte com `corpo_de_membership` (SQL). Se
      // este literal mudar e o SQL não, o onboarding inteiro cai com
      // `42501` — e o sintoma ("cadastro de empresa dá erro de permissão")
      // não aponta para "duas expressões que deviam ser iguais".
      expect(corpoDaAssinatura('u', 't', 'owner', 'p')).toBe('1:u1:t5:owner1:p');
    });

    it('profile_id nulo vira campo vazio, e role vazia vira `member`', () => {
      // Os dois normalizadores do SQL: `COALESCE(p_profile_id::text, '')` e
      // `COALESCE(p_role, 'member')`. A assinatura tem de normalizar do MESMO
      // lado que grava, senão a role gravada e a role assinada divergem.
      expect(corpoDaAssinatura('u', 't', 'member', null)).toBe('1:u1:t6:member0:');
      expect(corpoDaAssinatura('u', 't', '', null)).toBe('1:u1:t6:member0:');
    });

    it('a contagem é de BYTES, não de caracteres', () => {
      // `role` com acento: `String.length` diria 5, `octet_length`/`byteLength`
      // dizem 6. Medir pelo `.length` faria Node e Postgres discordarem e o
      // onboarding cair com `42501` — que parece erro de permissão e é
      // divergência de formato.
      expect(corpoDaAssinatura('u', 't', 'sócia', null)).toBe('1:u1:t6:sócia0:');
    });

    it('nenhuma redistribuição dos campos produz o mesmo corpo', () => {
      // ⚠️ Este teste já estava no arquivo e ficou VERMELHO quando foi escrito:
      // a 1ª versão separava os campos com `\n` e a propriedade afirmada era
      // FALSA, porque um valor que contém o próprio separador desloca a fronteira
      // entre dois campos. Aqui estão os dois casos que a 1ª versão colidia, e o
      // `corpo` com `\n` no meio de um UUID, que o cast `::uuid` rejeita mas o
      // formato não pode depender disso.
      const corpo = (a: string, b: string, c: string, d: string | null): string =>
        corpoDaAssinatura(a, b, c, d);

      expect(corpo('a\nb', 'c', 'member', null)).not.toBe(corpo('a', 'b', 'c\nmember', ''));
      expect(corpo('ab', 'c', 'member', null)).not.toBe(corpo('a', 'bc', 'member', null));
      expect(corpo('a', 'b', 'member', null)).not.toBe(corpo('a', 'b', 'membe', 'r'));
      // E a propriedade vale para a soma dos comprimentos: nenhum par de
      // quadruplas com o mesmo total de bytes pode colidir.
      expect(corpo('ab', 'c', 'member', null)).not.toBe(corpo('a', 'b', 'c', 'member'));
    });
  });

  describe('fail-fast', () => {
    it('sem `DIRECT_DATABASE_URL` o boot falha, e a mensagem diz por quê', async () => {
      // A conexão de DONO é a única que ignora RLS e por isso a única que lê
      // `chaves_de_assinatura`. Sem a variável não há caminho — e cair para o
      // `DATABASE_URL` (que é o runtime) daria `42501 permission denied`, que
      // é um erro que não explica a própria causa.
      delete process.env['DIRECT_DATABASE_URL'];
      const signer = new AssinaturaDeMembership();
      await expect(signer.onModuleInit()).rejects.toThrow(/DIRECT_DATABASE_URL ausente/);
    });

    it('assinar antes do boot falha em vez de devolver lixo', () => {
      // ⚠️ O nome do erro é o que separa as duas causas: sem esta linha, um
      // `assinar` que devolvesse string vazia pareceria funcionar até a função
      // do banco recusar, e a falha apareceria como `42501` — o mesmo sintoma de
      // assinatura errada, com outra causa embaixo.
      const signer = new AssinaturaDeMembership();
      expect(() => signer.assinar('u', 't', 'owner', null)).toThrow(
        /não carregada: `AssinaturaDeMembership.onModuleInit` não rodou/,
      );
    });
  });
});
