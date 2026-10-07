// apps/web/lib/cadastro-usuario-schema.ts
//
// Contrato de validação do formulário de cadastro de usuário.
//
// pt-BR: espelha `CreateUserSchema` em
// `apps/api/src/modules/users/infrastructure/http/users.schemas.ts`.
// É uma COPIA deliberada, não um import: o schema Zod do backend é local
// daquele módulo e o frontend não deve arrastar dependência de código de
// servidor. O risco de divergência é real e por isso as duas pontas
// citam este arquivo de origem no comentário.
//
// Duas diferenças deliberadas em relação ao backend:
//  1. `.trim()` — o backend aceita `"   "` (min(1) conta espaços). No
//     formulário isso é pior que inútil: o usuário "cria" um usuário sem
//     nome. O cliente é mais estrito, e o valor enviado já vai aparado.
//  2. As mensagens são de UI, não de log: dizem o que fazer, não só o que
//     está errado (regra do agent `ux-design-specialist`).

import { z } from 'zod';

export const NOME_MAX = 120;
export const EMAIL_MAX = 255;

export const cadastroUsuarioSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome do usuário.')
    .max(NOME_MAX, `O nome deve ter no máximo ${NOME_MAX} caracteres.`),
  email: z
    .string()
    .trim()
    .min(1, 'Informe o email.')
    .email('Email inválido. Exemplo: nome@empresa.com')
    .max(EMAIL_MAX, `O email deve ter no máximo ${EMAIL_MAX} caracteres.`),
});

export type CadastroUsuarioInput = z.infer<typeof cadastroUsuarioSchema>;

/** Nomes dos campos — usado para mapear erro de campo sem string solta. */
export type CampoCadastro = keyof CadastroUsuarioInput;
