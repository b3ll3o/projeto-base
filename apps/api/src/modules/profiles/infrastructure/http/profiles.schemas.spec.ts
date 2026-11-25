// apps/api/src/modules/profiles/infrastructure/http/profiles.schemas.spec.ts
//
// Os schemas do BC de Perfis (issue #185, code-N1-003).
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE
//
// Os schemas são a FRONTEIRA: é eles que recusam um corpo malformado antes
// que ele chegue ao agregado (que itera o valor cru e estourava 500). E o
// gate de cobertura de 80% conta o arquivo no denominador — um arquivo de
// schema sem spec entra no relatório como código não coberto.
//
// Os CASOS aqui são os que a REVISÃO do PR levantou como pergunta (e um deles
// como defeito):
//
//   1. O `refine` do zod 3 reprova só com `false` — uma string de mensagem é
//      truthy e APROVA. O `refine` do `slug` era INERTE (MEDIDO: o slug
//      'Slug Inválido' passava). O `superRefine` reprova de verdade.
//   2. A lista de permissões: lista válida passa, lista vazia passa, e o
//      teto conta as chaves DISTINTAS (o domínio deduplica).
//   3. O `permissionKey` NÃO é aparado: a comparação com o catálogo é exata.

import { describe, it, expect } from 'vitest';
import {
  AtualizarPerfilSchema,
  AtribuirPerfilSchema,
  ConcederAutorizacaoSchema,
  CriarPerfilSchema,
} from './profiles.schemas.js';

describe('Os schemas do BC de Perfis', () => {
  describe('CriarPerfilSchema', () => {
    it('aceita um corpo válido', () => {
      const resultado = CriarPerfilSchema.safeParse({
        slug: 'gestor',
        name: 'Gestor',
        description: 'Cuida das permissões',
        initialPermissions: ['users.read'],
      });
      expect(resultado.success).toBe(true);
    });

    it('aceita um corpo sem `description` e sem `initialPermissions`', () => {
      const resultado = CriarPerfilSchema.safeParse({ slug: 'gestor', name: 'Gestor' });
      expect(resultado.success).toBe(true);
    });

    it('RECUSA um slug inválido — e a mensagem é a DO VO', () => {
      // ⚠️ Este caso é o que estava INERTE: com `refine`, o zod 3 trata a
      // string de retorno como truthy e APROVA. O `superRefine` é o que
      // reprova.
      const resultado = CriarPerfilSchema.safeParse({ slug: 'Slug Inválido', name: 'Gestor' });
      expect(resultado.success).toBe(false);
      const problema = resultado.error?.issues[0];
      expect(problema?.message).toContain('kebab-case');
    });

    it('RECUSA um slug curto demais (o VO é o dono do limite)', () => {
      const resultado = CriarPerfilSchema.safeParse({ slug: 'a', name: 'Gestor' });
      expect(resultado.success).toBe(false);
      expect(resultado.error?.issues[0]?.message).toContain('deve ter ao menos');
    });

    it('RECUSA um nome vazio (o VO é o dono do limite)', () => {
      const resultado = CriarPerfilSchema.safeParse({ slug: 'gestor', name: '' });
      expect(resultado.success).toBe(false);
      expect(resultado.error?.issues[0]?.message).toContain('deve ter ao menos');
    });

    it('ACEITA um slug com maiúsculas (o VO normaliza) e devolve o valor cru', () => {
      // O `ProfileSlug.create` normaliza (trim + toLowerCase) ANTES do regex:
      // o schema não pode ser mais estrito que o domínio.
      const resultado = CriarPerfilSchema.safeParse({ slug: 'GESTOR', name: 'Gestor' });
      expect(resultado.success).toBe(true);
    });

    it('RECUSA `initialPermissions` que não é lista de textos', () => {
      for (const invalido of [123, { a: 'b' }, 'users.read', true]) {
        const resultado = CriarPerfilSchema.safeParse({
          slug: 'gestor',
          name: 'Gestor',
          initialPermissions: invalido,
        });
        expect(resultado.success, `initialPermissions: ${JSON.stringify(invalido)}`).toBe(false);
      }
    });

    it('ACEITA uma lista vazia de permissões', () => {
      const resultado = CriarPerfilSchema.safeParse({
        slug: 'gestor',
        name: 'Gestor',
        initialPermissions: [],
      });
      expect(resultado.success).toBe(true);
    });

    it('ACEITA chaves repetidas (o domínio deduplica) e RECUSA chaves distintas demais', () => {
      const repetidas = CriarPerfilSchema.safeParse({
        slug: 'gestor',
        name: 'Gestor',
        initialPermissions: ['users.read', 'users.read', 'users.read'],
      });
      expect(repetidas.success).toBe(true);

      const demais = CriarPerfilSchema.safeParse({
        slug: 'gestor',
        name: 'Gestor',
        initialPermissions: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
      });
      expect(demais.success).toBe(false);
    });

    it('ACEITA `description: null` (o perfil sem descrição é um estado válido)', () => {
      const resultado = CriarPerfilSchema.safeParse({
        slug: 'gestor',
        name: 'Gestor',
        description: null,
      });
      expect(resultado.success).toBe(true);
    });
  });

  describe('AtualizarPerfilSchema', () => {
    it('aceita um PATCH só com o nome (a descrição fica como está)', () => {
      const resultado = AtualizarPerfilSchema.safeParse({ name: 'Novo nome' });
      expect(resultado.success).toBe(true);
    });

    it('aceita `description: null` (a limpeza explícita)', () => {
      const resultado = AtualizarPerfilSchema.safeParse({ name: 'Novo nome', description: null });
      expect(resultado.success).toBe(true);
    });

    it('RECUSA um PATCH sem `name` (o nome é obrigatório na rota)', () => {
      const resultado = AtualizarPerfilSchema.safeParse({ description: 'x' });
      expect(resultado.success).toBe(false);
    });
  });

  describe('AtribuirPerfilSchema', () => {
    it('aceita um uuid, `null` e a AUSÊNCIA (o usuário fica sem perfil)', () => {
      const comId = AtribuirPerfilSchema.safeParse({
        profileId: '0190a8b6-0000-7000-8000-000000000001',
      });
      expect(comId.success).toBe(true);

      expect(AtribuirPerfilSchema.safeParse({ profileId: null }).success).toBe(true);
      expect(AtribuirPerfilSchema.safeParse({}).success).toBe(true);
    });

    it('RECUSA um `profileId` que não é uuid', () => {
      const resultado = AtribuirPerfilSchema.safeParse({ profileId: 'nao-e-uuid' });
      expect(resultado.success).toBe(false);
    });
  });

  describe('ConcederAutorizacaoSchema', () => {
    it('aceita uma chave do catálogo', () => {
      const resultado = ConcederAutorizacaoSchema.safeParse({ permissionKey: 'users.read' });
      expect(resultado.success).toBe(true);
    });

    it('RECUSA uma chave vazia', () => {
      const resultado = ConcederAutorizacaoSchema.safeParse({ permissionKey: '' });
      expect(resultado.success).toBe(false);
    });

    it('NÃO apara a chave: a comparação com o catálogo é do domínio e é EXATA', () => {
      // `' users.read '` era 400 INVALID_PERMISSION_KEY; se o schema aparasse,
      // viraria uma concessão de `users.read` — uma mudança de contrato que
      // ninguém pediu.
      const resultado = ConcederAutorizacaoSchema.safeParse({ permissionKey: ' users.read ' });
      expect(resultado.success).toBe(true);
      expect(resultado.data?.permissionKey).toBe(' users.read ');
    });
  });
});
