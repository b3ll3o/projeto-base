// apps/web/app/login/actions.ts
//
// Server Action de login.
//
// pt-BR: quatro responsabilidades, nesta ordem.
//  1. Validar de novo no servidor. O formulário valida com o mesmo schema
//     Zod no cliente, mas o cliente não é fronteira de confiança.
//  2. Traduzir a falha em algo que o formulário saiba exibir — SEM nunca
//     dizer qual dos dois campos estava errado.
//  3. Guardar os dois tokens em cookie httpOnly.
//  4. Redirecionar para a listagem no sucesso.
//
// A tela de login é a única do app em que a RECUSA é o caminho comum, e é
// por isso que a tradução do passo 2 é minimalista: um `401` não vira erro de
// campo, vira uma mensagem genérica no topo. Ver `CREDENCIAIS_INVALIDAS` em
// `state.ts` para a decisão completa.

'use server';

import { redirect } from 'next/navigation';
import { ApiClient, ApiError } from '@/lib/api-client';
import { loginSchema, type CampoLogin } from '@/lib/login-schema';
import { guardarTokens } from '@/lib/sessao';
import {
  CREDENCIAIS_INVALIDAS,
  ERRO_GENERICO_LOGIN,
  LOGIN_INICIAL,
  comTraceId,
  type LoginState,
} from './state';

const CAMPOS: CampoLogin[] = ['email', 'senha'];

function ehCampoDoFormulario(campo: string): campo is CampoLogin {
  return (CAMPOS as string[]).includes(campo);
}

/** O corpo que a API devolve no login bem-sucedido (contrato (D)). */
interface RespostaLogin {
  accessToken?: string;
  refreshToken?: string;
}

/**
 * O estado que volta para o browser, SEM o segredo dentro.
 *
 * pt-BR: o mesmo motivo do cadastro — `LoginState` é serializado e
 * devolvido ao Client Component. A senha volta vazia em TODO caminho de
 * erro; o preço é a pessoa redigitar depois de uma falha, e a alternativa
 * (devolver) é pior. O e-mail volta, porque não é segredo e evita a
 * redigitação.
 */
function valoresSemSegredo(valores: LoginState['valores']): LoginState['valores'] {
  return { ...valores, senha: '' };
}

/** Converte a falha da API no estado que o formulário consome. */
function estadoDeErro(erro: ApiError, valores: LoginState['valores']): LoginState {
  const { problem } = erro;
  const base = { ...LOGIN_INICIAL, valores: valoresSemSegredo(valores) };

  // pt-BR: o 401 vira mensagem genérica e SÓ ela. Nem `fieldErrors`, nem
  // texto que nomeie um dos dois campos — marcar o e-mail em vermelho já
  // seria entregar a resposta que a API se recusa a dar.
  if (problem.status === 401) {
    return { ...base, formError: CREDENCIAIS_INVALIDAS };
  }

  const fieldErrors: Partial<Record<CampoLogin, string>> = {};
  const orfaos: string[] = [];
  for (const erroCampo of problem.errors ?? []) {
    if (ehCampoDoFormulario(erroCampo.field)) {
      fieldErrors[erroCampo.field] ??= erroCampo.message;
    } else {
      orfaos.push(erroCampo.message);
    }
  }

  if (Object.keys(fieldErrors).length === 0 && orfaos.length === 0) {
    return { ...base, formError: comTraceId(ERRO_GENERICO_LOGIN, problem.traceId) };
  }

  return { ...base, fieldErrors, formError: orfaos.length > 0 ? orfaos.join(' ') : null };
}

export async function entrar(_estadoAnterior: LoginState, formData: FormData): Promise<LoginState> {
  const valores = {
    email: String(formData.get('email') ?? ''),
    senha: String(formData.get('senha') ?? ''),
  };

  const parsed = loginSchema.safeParse(valores);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<CampoLogin, string>> = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0];
      if (typeof campo === 'string' && ehCampoDoFormulario(campo)) {
        fieldErrors[campo] ??= issue.message;
      }
    }
    return { ...LOGIN_INICIAL, fieldErrors, valores: valoresSemSegredo(valores) };
  }

  const api = new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
  });

  let erro: unknown;
  let resposta: RespostaLogin | null = null;
  try {
    resposta = await api.post<RespostaLogin>('/auth/login', parsed.data);
  } catch (e) {
    erro = e;
  }

  // pt-BR: o `redirect` fica FORA do `try`. Ele funciona lançando uma
  // exceção NEXT_REDIRECT; um `try/catch` em volta engoliria o sinal de
  // navegação e a pessoa ficaria parada no formulário, com a sessão criada,
  // sem nenhuma indicação disso.
  if (erro instanceof ApiError) {
    return estadoDeErro(erro, valores);
  }
  if (erro) {
    // Falha de rede, resposta sem corpo JSON, exceção inesperada: nenhuma
    // delas chega como ApiError, e todas precisam virar mensagem na tela em
    // vez de estourar para o error boundary.
    return {
      ...LOGIN_INICIAL,
      valores: valoresSemSegredo(valores),
      formError: ERRO_GENERICO_LOGIN,
    };
  }

  // pt-BR: um 200 SEM tokens é falha, não login. Guardar `undefined`
  // produziria um cookie vazio — que `exigirSessao()` trata como ausente —
  // e a pessoa cairia no `/users` para ser imediatamente devolvida ao login,
  // sem nenhuma mensagem. Checar é o que transforma um 200 malformado em
  // erro visível.
  if (!resposta?.accessToken || !resposta?.refreshToken) {
    return {
      ...LOGIN_INICIAL,
      valores: valoresSemSegredo(valores),
      formError: ERRO_GENERICO_LOGIN,
    };
  }

  await guardarTokens(resposta.accessToken, resposta.refreshToken);

  redirect('/users');
}
