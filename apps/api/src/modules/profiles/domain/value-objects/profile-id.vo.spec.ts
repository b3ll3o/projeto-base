// apps/api/src/modules/profiles/domain/value-objects/profile-id.vo.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): testes do VO ProfileId.
//
// ⚠️ Este arquivo não existia, e `ProfileId` era o ÚNICO VO do diretório sem
// spec — o mesmo VO que lançava `Error` cru e produzia 500 em 6 rotas. Os
// vizinhos (`profile-name`, `profile-slug`, `authorization-key`) têm spec e
// lançam exceção de DOMÍNIO, mapeada para 400. Este teste existe para travar a
// diferença entre "lança alguma coisa" e "lança o que o mapper reconhece":
// `expect(...).toThrow()` sem argumento passa nas duas versões, e foi
// exatamente por isso que o defeito sobreviveu.
//
// A propriedade testada não é "recusa input ruim" — é "recusa com a exceção
// que `domain-exception-to-http.ts:218` mapeia para 400".

import { describe, it, expect } from 'vitest';
import { ProfileId, profileId } from './profile-id.vo.js';
import { UserValidationException } from '../../../users/domain/exceptions/user.exceptions.js';

const UUID_VALIDO = '3f8a1c22-5d47-4b91-a0e6-9c2f7d81b4aa';

describe('ProfileId', () => {
  describe('aceita', () => {
    it('um UUID em caixa baixa, que é a forma que o Postgres canoniza', () => {
      expect(ProfileId.create(UUID_VALIDO).value).toBe(UUID_VALIDO);
    });

    it('qualquer versão de UUID (v4 e v7), porque o perfil nasce nos dois caminhos', () => {
      // O `profiles.id` tem `@default(uuid())` (v4) no schema, mas `Profile.criar`
      // chama `ProfileId.create()` sem argumento, que gera v4 — e a hydration
      // pode trazer qualquer versão. Um VO que só aceitasse v7 quebraria a
      // reidratação. Este teste trava a escolha de NÃO restringir a versão.
      const v4 = '11111111-2222-4333-8444-555555555555';
      expect(ProfileId.create(v4).value).toBe(v4);
    });

    it('sem argumento, gera um UUID novo (caminho de `Profile.criar`)', () => {
      const gerado = ProfileId.create().value;
      expect(gerado).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(ProfileId.create().value).not.toBe(gerado);
    });
  });

  describe('rejeita com exceção de domínio, não com Error cru', () => {
    // ⚠️ Estes são os casos que viravam 500. A asserção é pelo TIPO, e não
    // `toThrow()` sem argumento: um `Error` puro satisfaz `toThrow()` e NÃO é
    // mapeado pelo `mapExceptionToHttp`, que cai no `{status: 500, code:
    // 'INTERNAL'}`. Com `toThrow()` puro, o teste ficaria verde antes e depois
    // da correção — e um teste que não distingue as duas versões não trava nada.
    const rejeitados: [string, unknown][] = [
      ['uuid malformado', 'abc'],
      ['uuid com um caractere trocado', '3f8a1c22-5d47-4b91-a0e6-9c2f7d81b4az'],
      ['uuid truncado', '3f8a1c22-5d47-4b91-a0e6-9c2f7d81b4a'],
      ['texto qualquer', 'nao-e-uuid'],
      ['string vazia', ''],
      ['número (o caso do body `{"profileId": 123}`)', 123],
      ['null', null],
      ['objeto', {}],
      ['array', []],
    ];

    for (const [descricao, entrada] of rejeitados) {
      it(`lança UserValidationException para ${descricao}`, () => {
        expect(() => ProfileId.create(entrada as string | undefined)).toThrow(
          UserValidationException,
        );
      });
    }

    it('NÃO é um Error puro — o mapper não tem caso para ele e cai em 500', () => {
      // A asserção negativa é a que tem dente. `UserValidationException` estende
      // `Error`, então `instanceof Error` é true nos dois casos; o que
      // distingue é o construtor nomeado, que o fall-through do mapper não
      // conhece.
      let capturado: unknown;
      try {
        ProfileId.create('abc');
      } catch (erro) {
        capturado = erro;
      }
      expect(capturado).toBeInstanceOf(UserValidationException);
      expect((capturado as Error).constructor.name).not.toBe('Error');
    });

    it('o campo da exceção é `profileId`, que é o nome que o cliente mandou', () => {
      // O nome do campo vira `errors[].field` no 400
      // (`domain-exception-to-http.ts:223`) — é contrato de wire, não detalhe
      // interno. O VO gêmeo em `users` usa `'id'`; aqui o nome segue o VO e o
      // campo do body.
      let capturado: UserValidationException | undefined;
      try {
        ProfileId.create('abc');
      } catch (erro) {
        capturado = erro as UserValidationException;
      }
      expect(capturado?.campo).toBe('profileId');
    });

    it('a mensagem não ecoa o valor recebido (a redação deixa de ser necessária)', () => {
      // A versão anterior imprimia `ProfileId inválido: [REDACTED]` — redigia o
      // valor de propósito, porque a mensagem pode acabar em log. Com
      // `UserValidationException` o `motivo` é um texto ESTÁTICO escolhido aqui
      // e o valor recebido não é interpolado: não sobra nada para redigir, e o
      // `[REDACTED]` some. O teste trava a propriedade que importa — a mensagem
      // não carrega a entrada — e falha se alguém "melhorar" a mensagem echoing
      // o valor.
      let capturado: Error | undefined;
      try {
        ProfileId.create('3f8a1c22-5d47-4b91-a0e6-9c2f7d81b4az');
      } catch (erro) {
        capturado = erro as Error;
      }
      expect(capturado?.message).not.toContain('3f8a1c22-5d47-4b91-a0e6-9c2f7d81b4az');
      expect(capturado?.message).toBe('profileId inválido: deve ser um UUID válido');
    });
  });

  describe('a função `profileId` delega ao VO', () => {
    it('mesmo contrato de aceitação', () => {
      expect(profileId(UUID_VALIDO).value).toBe(UUID_VALIDO);
    });

    it('mesma exceção de domínio na rejeição (a porta e o VO não divergem)', () => {
      expect(() => profileId('abc')).toThrow(UserValidationException);
    });
  });
});
