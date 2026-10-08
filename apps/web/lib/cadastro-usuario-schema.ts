// apps/web/lib/cadastro-usuario-schema.ts
//
// Contrato de validação do formulário de cadastro de usuário.
//
// pt-BR: espelha `CreateUserSchema` em
// `apps/api/src/modules/users/infrastructure/http/users.schemas.ts`.
// É uma CÓPIA deliberada, não um import: o schema Zod do backend é local
// daquele módulo e o frontend não deve arrastar dependência de código de
// servidor. O risco de divergência é real e por isso as duas pontas
// citam este arquivo de origem no comentário.
//
// MEDIDO 2026-10-08: a cópia tinha envelhecido. Este arquivo declarava
// `NOME_MAX = 120` e `EMAIL_MAX = 255`; a regra de domínio
// (`UserName` VO e `Email` VO, que o `CreateUserSchema` agora importa)
// aceita 2..100 e até 254. Um nome de 105 chars passava o formulário e
// a API devolvia 500. Um email de 255 chars, idem.
//
// A cópia continua sendo cópia — o que muda é que os números são os de
// hoje, e o guardião de que continuem sendo é
// `cadastro-usuario-schema.parity.spec.ts`, que lê o fonte dos VOs da API
// e compara os três números. Do outro lado do repositório, o guardião
// próprio da API é `apps/api/src/modules/users/infrastructure/http/
// users.schemas.spec.ts` (boundary ↔ domínio). São três lugares que
// declaram a mesma regra, e dois specs que conferem. Mudar um sem o outro
// é vermelho nos dois.
//
// Diferenças deliberadas em relação ao backend:
//  1. `.trim()` — o backend conta caracteres crus no boundary e os
//     aparados no VO. No formulário aparar antes é melhor que inútil: o
//     valor que sai já vai aparado, e o `min(2)` aqui conta o que a
//     pessoa realmente digitou.
//  2. As mensagens são de UI, não de log: dizem o que fazer, não só o que
//     está errado (regra do agent `ux-design-specialist`).

import { z } from 'zod';

export const NOME_MIN = 2;
export const NOME_MAX = 100;
export const EMAIL_MAX = 254;

export const cadastroUsuarioSchema = z.object({
  nome: z
    .string()
    .trim()
    // pt-BR: dois `min` em cadeia, não um. "Em branco" e "curto demais"
    // são regras diferentes e a pessoa precisa da mensagem de cada uma:
    // `min(2)` sozinho transformava campo vazio em "pelo menos 2
    // caracteres", que é responder uma pergunta que ela não fez.
    // O Zod emite as duas issues e a tela mostra a primeira.
    .min(1, 'Informe o nome do usuário.')
    .min(NOME_MIN, `O nome deve ter pelo menos ${NOME_MIN} caracteres.`)
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
