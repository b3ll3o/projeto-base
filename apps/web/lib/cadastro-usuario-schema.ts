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
//  3. A senha NÃO recebe `.trim()`, ao contrário de nome e email. Apagar
//     espaço nas pontas de um segredo é mutá-lo em silêncio: a pessoa
//     digita "senha " e entra "senha", e quando um dia o espaço voltar a
//     ser legítimo ("senha " ≠ "senha") o que ela digitou deixa de ser o
//     que foi usado. NOME/EMAIL são identidades e toleram normalização;
//     senha é segredo e não tolera. Sem `.trim()`, o `min(1)` de "campo em
//     branco" é alcançado só por string vazia — que é o caso que a
//     microcopy precisa descrever.

import { z } from 'zod';

export const NOME_MIN = 2;
export const NOME_MAX = 100;
export const EMAIL_MAX = 254;
export const SENHA_MIN = 8;
export const SENHA_MAX = 72;

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
  senha: z
    .string()
    // pt-BR: os dois `min` em cadeia são a mesma decisão do campo nome, e
    // pelo mesmo motivo: "campo vazio" e "senha curta" são defeitos
    // diferentes, e a pessoa precisa da mensagem de cada um. O Zod emite as
    // duas issues e a tela mostra a primeira (`cadastro-usuario-form.tsx`
    // deduplica por campo justamente para isso).
    .min(1, 'Informe a senha.')
    .min(SENHA_MIN, `A senha deve ter pelo menos ${SENHA_MIN} caracteres.`)
    // pt-BR: o teto de 72 não é arbitrário — é o TAMANHO DE ENTRADA do
    // bcrypt (72 bytes). Acima dele o hash começa a truncar em silêncio: os
    // bytes finais deixam de participar do digest e duas senhas diferentes
    // viram o mesmo hash. Por isso o teto é de senha e o de email é outro,
    // e por isso os dois números não podem ser o mesmo número.
    .max(SENHA_MAX, `A senha deve ter no máximo ${SENHA_MAX} caracteres.`),
});

export type CadastroUsuarioInput = z.infer<typeof cadastroUsuarioSchema>;

/** Nomes dos campos — usado para mapear erro de campo sem string solta. */
export type CampoCadastro = keyof CadastroUsuarioInput;
