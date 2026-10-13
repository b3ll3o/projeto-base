// apps/web/app/login/state.ts
//
// Estado do formulário de login.
//
// pt-BR: fica num arquivo separado de `actions.ts` pelo mesmo motivo do
// cadastro — um arquivo com `'use server'` só pode exportar funções async,
// então uma constante exportada de lá quebra o build do Next. O TIPO também
// mora aqui para que a Action e o formulário compartilhem uma única
// definição do formato do estado.

import type { CampoLogin } from '@/lib/login-schema';

/** O que a Action devolve ao `useActionState` a cada envio. */
export interface LoginState {
  /** `true` quando o login deu certo (a Action redireciona antes de devolver). */
  ok: boolean;
  /** Erro por campo — o formulário mostra a mensagem junto do input. */
  fieldErrors: Partial<Record<CampoLogin, string>>;
  /** Erro que não pertence a um campo — aparece no topo do formulário. */
  formError: string | null;
  /** O que a pessoa digitou, para o formulário não limpar o que ela preencheu. */
  valores: { email: string; senha: string };
}

export const LOGIN_INICIAL: LoginState = {
  ok: false,
  fieldErrors: {},
  formError: null,
  // pt-BR: a senha volta VAZIA, nunca com o que foi digitado — o mesmo
  // motivo do cadastro. Este estado é serializado e devolvido ao Client
  // Component: ele passa pela rede, fica no payload da Server Action e
  // aparece no DevTools. O `httpOnly` do cookie de sessão existe
  // justamente para tornar o token inacessível ao script da página; devolver
  // a senha aqui seria o mesmo furo, pelo outro lado. O e-mail volta
  // porque a utilidade dele é não obrigar a pessoa a redigitar, e e-mail não
  // é segredo.
  valores: { email: '', senha: '' },
};

/**
 * Resposta a credencial recusada — e a parte mais importante deste arquivo.
 *
 * pt-BR: a API responde `401 INVALID_CREDENTIALS` para "e-mail não existe"
 * E para "senha errada", com a MESMA mensagem (contrato (D)) — e é
 * exatamente por isso que a tela também precisa de uma mensagem só. Duas
 * mensagens diferentes permitiriam a quem tentasse descobrir quais contas
 * existem, e essa é uma resposta que a API se recusa a dar.
 *
 * A mensagem nomeia os DOIS campos ("e-mail ou senha"), o que não é
 * distinguir: quem não sabe qual dos dois digitou errado não consegue
 * inferir nada. O que seria distinguir é "e-mail não encontrado".
 *
 * Ela também NÃO é `fieldErrors`. A tela de login não pode marcar nenhum
 * campo em vermelho por causa de uma recusa — vermelho no `email` seria a
 * mesma informação da mensagem diferenciada, só que pela cor.
 */
export const CREDENCIAIS_INVALIDAS = 'E-mail ou senha incorretos.';

/**
 * Mensagem para qualquer falha que não sabemos atribuir a um campo.
 *
 * pt-BR: NÃO usamos `problem.title` da API. Os títulos são escritos para
 * consumo de máquina/log ("Erro interno") e não são explicação para quem
 * está digitando uma senha. O traceId vai junto porque é o que permite
 * retomar a conversa com o suporte.
 */
export const ERRO_GENERICO_LOGIN =
  'Não foi possível entrar. Verifique a conexão e tente novamente.';

/** Anexa o traceId ao fim da mensagem, quando existe. */
export function comTraceId(mensagem: string, traceId?: string): string {
  return traceId ? `${mensagem} Código de rastreamento: ${traceId}.` : mensagem;
}
