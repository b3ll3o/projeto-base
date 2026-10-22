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

/**
 * A sessão entrou, mas a CONSULTA das empresas falhou.
 *
 * pt-BR: este é o caso que o funil do login tratava em SILÊNCIO — a consulta
 * falhava, o `catch` caía em `/users` sem empresa, e a pessoa que era DONA de
 * uma empresa com cinco pessoas via "1 usuário cadastrado" (só ela), sem erro
 * nenhum. "Não sei se a conta tem empresa" e "a conta não tem empresa" são
 * ESTADOS DIFERENTES, e o segundo não pode ser assumido quando o primeiro é o
 * que aconteceu.
 *
 * A mensagem diz o que fazer (entrar de novo), porque entrar de novo refaz a
 * consulta — e a sessão já está guardada, então o login não precisa ser
 * desfeito.
 */
export const ERRO_CONSULTA_DAS_EMPRESAS =
  'Não foi possível consultar suas empresas. Tente entrar de novo.';

/**
 * Query param que a tela de cadastro usa para avisar que a conta ficou criada.
 *
 * pt-BR: mora AQUI, e não em `actions.ts` do cadastro, porque um arquivo
 * com `'use server'` só pode exportar funções async — a constante teria de
 * ser duplicada no produtor e no consumidor, que é o jeito mais barato de
 * um `redirect` calado apontar para uma rota que ninguém renderiza. E o valor
 * precisa ser um sinal, não a mensagem: a query string é serializada e
 * pode aparecer em log de borda e no histórico do browser.
 */
export const PARAM_CADASTRO_CONCLUIDO = 'cadastrado';

/**
 * Confirmação que o login abre depois de um cadastro.
 *
 * ⚠️ Não diz "você foi cadastrado com sucesso" e entra direto no produto: a
 * conta foi criada, mas a pessoa AINDA NÃO TEM SESSÃO (o cadastro não assina
 * token), e ela precisa digitar a senha que acabou de escolher. Uma
 * mensagem que pulasse essa etapa seria uma promessa que o app não cumpre.
 */
export const AVISO_CADASTRO_CONCLUIDO =
  'Cadastro feito. Agora entre com o e-mail e a senha que você acabou de escolher.';

/**
 * Query param que a tela de criação de empresa usa para avisar que a sessão
 * venceu no meio do formulário.
 *
 * pt-BR: é o MESMO mecanismo do `?cadastrado=1` — um SINAL na query string,
 * nunca o dado. O nome e o identificador da empresa digitados NÃO viajam na
 * URL: a query string é serializada, aparece no histórico do browser e no
 * log de borda.
 */
export const PARAM_EMPRESA_PENDENTE = 'empresa';

/**
 * A sessão venceu antes de a empresa ser criada.
 *
 * pt-BR: sem este aviso, a pessoa que preenchia o formulário era levada para
 * o login sem explicação nenhuma, voltava para `/empresa/nova` com o
 * formulário vazio, e não sabia o que tinha acontecido. É o mesmo "beco sem
 * saída de dois saltos" que o `?cadastrado=1` já resolve no cadastro.
 *
 * ⚠️ O que o aviso NÃO promete: os valores digitados são perdidos — a
 * pessoa digita de novo. Preservá-los exigiria um cookie curto, e é decisão
 * de produto, não correção.
 */
export const AVISO_EMPRESA_PENDENTE =
  'Sua sessão venceu antes de a empresa ser criada. Entre de novo para criar a empresa.';

/** Anexa o traceId ao fim da mensagem, quando existe. */
export function comTraceId(mensagem: string, traceId?: string): string {
  return traceId ? `${mensagem} Código de rastreamento: ${traceId}.` : mensagem;
}
