// apps/web/app/login/actions.ts
//
// Server Action de login.
//
// pt-BR: cinco responsabilidades, nesta ordem.
//  1. Validar de novo no servidor. O formulário valida com o mesmo schema
//     Zod no cliente, mas o cliente não é fronteira de confiança.
//  2. Traduzir a falha em algo que o formulário saiba exibir — SEM nunca
//     dizer qual dos dois campos estava errado.
//  3. Guardar os dois tokens em cookie httpOnly.
//  4. Decidir para ONDE a pessoa vai depois de entrar — a empresa em que a
//     sessão vai agir.
//  5. Redirecionar.
//
// A tela de login é a única do app em que a RECUSA é o caminho comum, e é
// por isso que a tradução do passo 2 é minimalista: um `401` não vira erro de
// campo, vira uma mensagem genérica no topo. Ver `CREDENCIAIS_INVALIDAS` em
// `state.ts` para a decisão completa.

'use server';

import { redirect } from 'next/navigation';
import { ApiClient, ApiError } from '@/lib/api-client';
import { ehTokenDeConvite } from '@/lib/convite-schema';
import { listarEmpresas } from '@/lib/empresas';
import { loginSchema, type CampoLogin } from '@/lib/login-schema';
import { obterMeuPerfilGlobal } from '@/lib/perfil';
import { guardarTenant, guardarTokens, limparTenant } from '@/lib/sessao';
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

/**
 * Para onde a pessoa vai depois de entrar, e em que empresa a sessão age.
 *
 * pt-BR (onboarding de empresa, 2026-10-21): o login deixou de ser "sempre
 * `/users`" porque TODA conta pertence a uma empresa — exceto o administrador
 * de SISTEMA, que administra a plataforma e não pertence a empresa nenhuma.
 * A tela que essa regra produz é a de criação de empresa.
 *
 * A ordem das perguntas é a que não erra:
 *
 *  1. **`GET /me/tenants`** — as empresas do ator. Lista VAZIA é resposta
 *     normal (conta em onboarding, ou o admin de sistema), não erro. Se há
 *     alguma, a sessão passa a agir na PRIMEIRA delas — e o cookie
 *     `tenant_id` é gravado, porque é ele que faz o `X-Tenant-Id` sair.
 *  2. **`GET /me/profile` no bucket GLOBAL** — só para a conta sem empresa
 *     nenhuma. É o que separa o DONO (da empresa, que se resolve pelo
 *     membership) do ADMINISTRADOR DE SISTEMA (que se resolve por
 *     `users.profile_id`). O `isAdmin` global é o mesmo sinal que a API usa
 *     em `ehAdministradorDeSistema` (`tenantId === null && isAdmin`).
 *
 * ⚠️ Por que o perfil GLOBAL e não o da empresa: quem não tem empresa não
 * tem perfil de empresa — e quem tem empresa pode não ter perfil NELA (a
 * membership criada por convite deixa `profile_id` NULL). O sinal "pertence
 * a alguma empresa" é o memberships, e o sinal "é admin de sistema" é o
 * bucket global. Misturar os dois daria o resultado errado nos dois lados.
 *
 * ⚠️ A PRIMEIRA empresa é a escolhida quando há várias. Não há tela de
 * escolha de empresa no produto, e nenhuma foi pedida — o que existe hoje é
 * o mínimo para o funil funcionar.
 */
async function destinoAposLogin(
  accessToken: string,
): Promise<{ rota: string; tenantId: string | null }> {
  const empresas = await listarEmpresas(accessToken);
  // pt-BR: `noUncheckedIndexedAccess` está ligado — `empresas[0]` é
  // `T | undefined` mesmo com `length > 0` garantido. Pegar o primeiro
  // elemento pelo nome é o que fecha o tipo sem `!`.
  const primeira = empresas[0];
  if (primeira !== undefined) {
    return { rota: '/users', tenantId: primeira.id };
  }

  const perfil = await obterMeuPerfilGlobal(accessToken);
  if (perfil?.isAdmin === true) {
    // Administrador de SISTEMA: administra a plataforma, não pertence a
    // empresa nenhuma — é a exceção da invariante, e por isso não é levado a
    // criar uma empresa que ele não vai usar.
    return { rota: '/users', tenantId: null };
  }

  return { rota: '/empresa/nova', tenantId: null };
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

  // pt-BR (onboarding de empresa, 2026-10-21): a pessoa que entrou por um
  // LINK DE CONVITE precisa terminar o aceite — e o aceite é o que cria a
  // membership na empresa que convidou. Sem este desvio, o funil abaixo
  // perguntaria "qual empresa?" e a conta (que ainda não tem membership
  // nenhuma) seria levada a `/empresa/nova` — a reserva de uma falha de
  // consulta virando o caminho que CRIA empresa.
  //
  // O token é validado AQUI, no servidor: o `FormData` não é fronteira de
  // confiança, e um token adulterado não pode escolher a rota.
  const convite = formData.get('convite');
  if (typeof convite === 'string' && ehTokenDeConvite(convite)) {
    // ⚠️ O cookie `tenant_id` é APAGADO: ele pertence à identidade ANTERIOR
    // (a sessão que acabou de ser trocada), e a empresa que ele nomeia pode
    // ser de outra conta. Mantido, ele sairia como `X-Tenant-Id` de uma
    // empresa que a pessoa não pertence. É o mesmo motivo do `limparTenant()`
    // abaixo, e aqui é ainda mais necessário: o aceite do convite é o que
    // grava o cookie CERTO, logo depois.
    await limparTenant();
    redirect(`/convite/${convite}`);
  }

  // pt-BR: a sessão JÁ está guardada — o login deu certo. O que pode falhar
  // aqui é a CONSULTA que decide a tela, e essa falha não pode virar a tela
  // de erro do Next: a pessoa entrou, e um erro de rede na hora de escolher
  // a empresa é o tipo de coisa que não pode apagar o login que deu certo.
  //
  // A rota de reserva é `/users`, e NÃO `/empresa/nova`: a consulta falhou, e
  // então NÃO sabemos se a conta tem empresa. Levar quem TEM empresa para a
  // tela de criação produz uma empresa DUPLICADA — mesmo dono, mais um
  // conjunto de perfis, e nada na tela avisa que era duplicado. `/users` não
  // cria nada, e quem de fato não tem empresa cai na tela principal até
  // entrar de novo.
  let destino: { rota: string; tenantId: string | null };
  try {
    destino = await destinoAposLogin(resposta.accessToken);
  } catch {
    destino = { rota: '/users', tenantId: null };
  }

  if (destino.tenantId !== null) {
    await guardarTenant(destino.tenantId);
  } else {
    // A conta NÃO tem empresa (ou a consulta falhou): a empresa de uma sessão
    // ANTERIOR é apagada. Mantida, ela vira `X-Tenant-Id` de uma empresa que
    // a pessoa não pertence — e a API responde 403
    // `TENANT_MEMBERSHIP_REQUIRED` na tela principal, sem caminho de volta.
    await limparTenant();
  }

  redirect(destino.rota);
}
