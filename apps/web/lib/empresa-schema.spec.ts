// apps/web/lib/empresa-schema.spec.ts
//
// Contrato de validação do formulário de criação de empresa.
//
// pt-BR (onboarding de empresa, 2026-10-21): `empresa-schema.ts` é cópia
// deliberada do `CriarEmpresaSchema` da API
// (`apps/api/src/modules/tenancy/infrastructure/http/tenancy-empresas.controller.ts`)
// — pelo mesmo motivo do cadastro: o frontend não arrasta dependência de
// código de servidor.
//
// Este spec tem DUAS partes, e as duas importam:
//
//  1. O COMPORTAMENTO do schema (o que aceita e o que recusa).
//  2. A PARIDADE dos literais com a API, lendo o fonte do controller. Cópia
//     sem guardião envelhece sozinha — e no cadastro isso já aconteceu
//     (MEDIDO 2026-10-08: `NOME_MAX = 120` contra 100 do domínio).
//     O `slug` é onde a paridade mais dói: a API aceita 3..50 e um padrão
//     específico, e um formulário mais permissivo devolveria 400.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { empresaSchema, SLUG_MAX, SLUG_MIN, SLUG_REGEX } from './empresa-schema';

const CONTROLLER = fileURLToPath(
  new URL(
    '../../api/src/modules/tenancy/infrastructure/http/tenancy-empresas.controller.ts',
    import.meta.url,
  ),
);

describe('empresaSchema', () => {
  it('aceita um nome e um identificador válidos', () => {
    const resultado = empresaSchema.safeParse({ nome: 'ACME Ltda', slug: 'acme-ltda' });
    expect(resultado.success).toBe(true);
  });

  it('exige o nome — campo vazio é "em branco", não "curto demais"', () => {
    const resultado = empresaSchema.safeParse({ nome: '', slug: 'acme' });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe('Informe o nome da empresa.');
  });

  it('recusa o nome abaixo do mínimo da API', () => {
    const resultado = empresaSchema.safeParse({ nome: 'A', slug: 'acme' });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toContain('pelo menos 2');
  });

  it('exige o identificador', () => {
    const resultado = empresaSchema.safeParse({ nome: 'ACME', slug: '' });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe('Informe o identificador da empresa.');
  });

  it('recusa o identificador fora do padrão da API (maiúscula, espaço, underline, hífen na ponta)', () => {
    for (const slug of ['ACME', 'acme ltda', 'acme_ltda', 'acme-ltda-', '-acme']) {
      expect(empresaSchema.safeParse({ nome: 'ACME', slug }).success).toBe(false);
    }
  });

  it('recusa o identificador fora dos limites de tamanho', () => {
    expect(empresaSchema.safeParse({ nome: 'ACME', slug: 'ab' }).success).toBe(false);
    expect(empresaSchema.safeParse({ nome: 'ACME', slug: 'a'.repeat(SLUG_MAX + 1) }).success).toBe(
      false,
    );
  });

  it('apara o que a pessoa digitou nas pontas', () => {
    const resultado = empresaSchema.safeParse({ nome: '  ACME  ', slug: ' acme ' });
    expect(resultado.success).toBe(true);
    // pt-BR: `expect(...).toBe(true)` NÃO estreita o tipo — o `safeParse` devolve
    // uma união discriminada, e o TypeScript só estreita por controle de
    // fluxo. O `throw` é o desempate: se o parse falhar, o teste morre com a
    // mensagem do Zod em vez de pular a asserção em silêncio.
    if (!resultado.success) throw new Error(resultado.error.message);
    expect(resultado.data.nome).toBe('ACME');
    expect(resultado.data.slug).toBe('acme');
  });
});

describe('paridade web ↔ API (a cópia é guardada, não é confiança)', () => {
  it('os limites do identificador são os mesmos da API', () => {
    const fonte = readFileSync(CONTROLLER, 'utf8');
    expect(fonte).toContain(`.min(${SLUG_MIN})`);
    expect(fonte).toContain(`.max(${SLUG_MAX})`);
  });

  it('a expressão do identificador é a mesma da API', () => {
    const fonte = readFileSync(CONTROLLER, 'utf8');
    expect(fonte).toContain(SLUG_REGEX.source);
  });

  it('a API também apara o identificador nas pontas', () => {
    const fonte = readFileSync(CONTROLLER, 'utf8');

    // ⚠️ O `.trim()` é a ÚNICA das diferenças entre as duas cópias que produz
    // comportamento observável — e ela NÃO era comparada: a spec comparava
    // `min`, `max` e a expressão. O resultado era a API recusando `" acme "`
    // com a mensagem de formato, enquanto o formulário aceitava e aparava.
    //
    // O trecho é o do `slug`, e não o arquivo inteiro: o `nome` tem um
    // `.trim()` ANTES do `slug: z`, e um `toContain('.trim()')` na fonte
    // inteira passaria por causa do nome — o mesmo verde falso que a spec
    // denuncia nos outros casos (comparar o `min` com ele mesmo).
    const inicio = fonte.indexOf('slug: z');
    const trechoDoSlug = fonte.slice(inicio, fonte.indexOf('});', inicio));

    expect(trechoDoSlug).toContain('.trim()');
  });
});
