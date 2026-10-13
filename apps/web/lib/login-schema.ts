// apps/web/lib/login-schema.ts
//
// Contrato de validação do formulário de LOGIN.
//
// pt-BR: este arquivo NÃO espelha um schema do backend. Ele é a única
// validação que roda antes de qualquer chamada de rede, e o que ele
// decide é deliberadamente pouco: formato, não existência. Nada aqui
// pergunta se a conta existe — pergunta isso seria devolver ao formulário
// uma resposta que a API se recusa a dar (401 genérico), e a quebra de
// enumeração de contas está justamente aí.
//
// Os dois limites (254 no e-mail, 72 na senha) são IMPORTADOS de
// `cadastro-usuario-schema.ts`, não redigitados. Motivo: a senha criada tem
// teto de 72 porque é o TAMANHO DE ENTRADA do bcrypt/argon2; se o login
// aceitasse 73 e devolvesse 401, a pessoa veria "senha incorreta" para uma
// senha que nunca pode ter sido cadastrada. Importar é o que impede os dois
// números de envelhecerem em separado.
//
// pt-BR (por que o login NÃO tem mínimo de senha, contra o cadastro):
// quem está entrando JÁ TEM conta. A pergunta útil do formulário de entrada
// é "o campo está em branco?". Se a senha vier curta, a resposta certa vem
// da API, e a API responde 401 genérico justamente para não dar informação
// a quem não tem a senha. Um `min(8)` aqui seria repetir uma regra de
// cadastro numa tela onde ela não decide nada.
//
// pt-BR (aparar): `.trim()` no e-mail, nunca na senha. E-mail é identidade e
// tolera normalização; senha é segredo, e aparar um segredo é mutá-lo em
// silêncio — a pessoa digita "senha " e entra "senha". É a mesma decisão do
// `cadastro-usuario-schema.ts`, e pelo mesmo motivo.

import { z } from 'zod';
import { EMAIL_MAX, SENHA_MAX } from './cadastro-usuario-schema';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail.')
    .email('E-mail inválido. Exemplo: nome@empresa.com')
    .max(EMAIL_MAX, `O e-mail deve ter no máximo ${EMAIL_MAX} caracteres.`),
  senha: z
    .string()
    .min(1, 'Informe a senha.')
    .max(SENHA_MAX, `A senha deve ter no máximo ${SENHA_MAX} caracteres.`),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Nomes dos campos — usado para mapear erro de campo sem string solta. */
export type CampoLogin = keyof LoginInput;
