// apps/web/lib/empresa-schema.ts
//
// Contrato de validação do formulário de criação de empresa.
//
// pt-BR (onboarding de empresa, 2026-10-21): espelha o `CriarEmpresaSchema`
// de `apps/api/src/modules/tenancy/infrastructure/http/tenancy-empresas.controller.ts`.
// É uma CÓPIA deliberada, pelo mesmo motivo do cadastro: o schema Zod do
// backend é local daquele módulo, e o frontend não arrasta dependência de
// código de servidor.
//
// ⚠️ A cópia é guardada por `empresa-schema.spec.ts`, que compara os
// LITERais do `slug` com o fonte da API — o número que diverge é o que
// transforma um formulário permissivo em 400 na hora de salvar.
//
// Os limites de NOME não são declarados aqui: são reusados de
// `cadastro-usuario-schema.ts` (`NOME_MIN`/`NOME_MAX`), que já espelham o VO
// `UserName` da API — e a API usa o MESMO VO para o nome da empresa
// (`MIN_LENGTH as NOME_MIN` no controller). Um número, uma fonte.
//
// Diferenças deliberadas em relação ao backend:
//  1. `.trim()` no nome e no identificador. O backend conta os caracteres
//     crus no boundary; no formulário aparar antes é melhor que inútil — o
//     valor que sai já vai aparado.
//  2. As mensagens são de UI, não de log: dizem o que fazer, não só o que
//     está errado (regra do agent `ux-design-specialist`).

import { z } from 'zod';
import { NOME_MAX, NOME_MIN } from './cadastro-usuario-schema';

/** O identificador mínimo — o mesmo `min(3)` do controller da API. */
export const SLUG_MIN = 3;
/** O identificador máximo — o mesmo `max(50)` do controller da API. */
export const SLUG_MAX = 50;

/**
 * O padrão do identificador — o MESMO do controller da API.
 *
 * Minúsculo, dígitos e hífens INTERNOS: `acme-ltda` passa, `ACME`,
 * `acme ltda`, `acme_ltda` e `acme-` não. O hífen na ponta é o que a
 * expressão proíbe — e é o que o controller proíbe.
 */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const empresaSchema = z.object({
  nome: z
    .string()
    .trim()
    // pt-BR: dois `min` em cadeia, não um — "em branco" e "curto demais" são
    // regras diferentes e a pessoa precisa da mensagem de cada uma (o mesmo
    // argumento do campo nome do cadastro).
    .min(1, 'Informe o nome da empresa.')
    .min(NOME_MIN, `O nome deve ter pelo menos ${NOME_MIN} caracteres.`)
    .max(NOME_MAX, `O nome deve ter no máximo ${NOME_MAX} caracteres.`),
  slug: z
    .string()
    .trim()
    .min(1, 'Informe o identificador da empresa.')
    .min(SLUG_MIN, `O identificador deve ter pelo menos ${SLUG_MIN} caracteres.`)
    .max(SLUG_MAX, `O identificador deve ter no máximo ${SLUG_MAX} caracteres.`)
    .regex(SLUG_REGEX, 'Use apenas letras minúsculas, números e hífens (ex.: acme-ltda).'),
});

export type EmpresaInput = z.infer<typeof empresaSchema>;

/** Nomes dos campos — usado para mapear erro de campo sem string solta. */
export type CampoEmpresa = keyof EmpresaInput;
