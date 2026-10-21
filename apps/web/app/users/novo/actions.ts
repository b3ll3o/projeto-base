// apps/web/app/users/novo/actions.ts
//
// Server Action do cadastro de usuário.
//
// pt-BR: três responsabilidades, nesta ordem.
//  1. Validar de novo no servidor. O formulário valida com o mesmo schema
//     Zod no cliente, mas o cliente não é fronteira de confiança: o `POST`
//     pode chegar de fora do formulário.
//  2. Traduzir a resposta de erro da API em algo que o formulário saiba
//     exibir — por campo quando dá, no topo quando não dá. A API responde
//     RFC 7807 (`code`, `errors[]`, `traceId`); a tela precisa de
//     "qual input está vermelho".
//  3. Redirecionar para a listagem no sucesso.
//
// A validação do cliente e a do servidor usam o MESMO schema
// (`@/lib/cadastro-usuario-schema`) justamente para que as duas camadas não
// possam discordar sobre o que é válido.

'use server';

import { redirect } from 'next/navigation';
import { ApiClient, ApiError } from '@/lib/api-client';
import { cadastroUsuarioSchema, type CampoCadastro } from '@/lib/cadastro-usuario-schema';
import { ehTokenDeConvite } from '@/lib/convite-schema';
import type { CreateUserInputDto } from '@projeto/shared-types';
import { CADASTRO_INICIAL, ERRO_GENERICO, comTraceId, type CadastroUsuarioState } from './state';

const CAMPOS: CampoCadastro[] = ['nome', 'email', 'senha'];

function ehCampoDoFormulario(campo: string): campo is CampoCadastro {
  return (CAMPOS as string[]).includes(campo);
}

/**
 * O estado que volta para o browser, SEM o segredo dentro.
 *
 * pt-BR: `CadastroUsuarioState` é serializado e devolvido ao Client
 * Component — ele passa pela rede, fica no payload da Server Action e é
 * visível no DevTools. Devolver ali a senha digitada significaria que o
 * segredo da pessoa sobrevive a um formulário que deu ERRO, stored num
 * lugar que ninguém escolheu para guardá-lo e que o `httpOnly` dos cookies
 * de sessão existe justamente para tornar inacessível ao script da página.
 *
 * Por isso a senha volta vazia em TODO caminho de erro. O preço é real e
 * conhecido: depois de um erro a pessoa precisa redigitar a senha. É o
 * preço de não devolver o segredo, e a alternativa (devolver) é pior.
 * Nome e email continuam voltando, porque a utilidade deles é justamente a
 * de não obrigar a pessoa a redigitar.
 */
function valoresSemSegredo(
  valores: CadastroUsuarioState['valores'],
): CadastroUsuarioState['valores'] {
  return { ...valores, senha: '' };
}

/**
 * Converte a falha da API no estado que o formulário consome.
 *
 * pt-BR: três destinos, nesta ordem de precedência.
 * - `EMAIL_IN_USE` → campo `email`. É o único caso em que o backend confirma
 *   um conflito com um campo específico, e ele é o erro que mais acontece
 *   na prática (a pessoa recadastrando o mesmo contato).
 * - `errors[]` → cada `field` que o formulário conhece vira erro de campo.
 * - qualquer coisa mais → topo do formulário, com traceId.
 *
 * Um `errors[]` cujo campo não existe no formulário NÃO é descartado: ele é
 * somado ao topo. Descartar seria a mesma falha de um log em inglês numa
 * tela pt-BR — o usuário ficaria sem nenhuma explicação visível.
 */
function estadoDeErro(
  erro: ApiError,
  valores: CadastroUsuarioState['valores'],
): CadastroUsuarioState {
  const { problem } = erro;
  const base = { ...CADASTRO_INICIAL, valores: valoresSemSegredo(valores) };

  if (problem.code === 'EMAIL_IN_USE') {
    return { ...base, fieldErrors: { email: 'Este email já está cadastrado.' } };
  }

  const fieldErrors: Partial<Record<CampoCadastro, string>> = {};
  const orfaos: string[] = [];
  for (const erroCampo of problem.errors ?? []) {
    if (ehCampoDoFormulario(erroCampo.field)) {
      fieldErrors[erroCampo.field] ??= erroCampo.message;
    } else {
      orfaos.push(erroCampo.message);
    }
  }

  if (Object.keys(fieldErrors).length === 0 && orfaos.length === 0) {
    return { ...base, formError: comTraceId(ERRO_GENERICO, problem.traceId) };
  }

  const formError = orfaos.length > 0 ? orfaos.join(' ') : null;

  return { ...base, fieldErrors, formError };
}

export async function cadastrarUsuario(
  _estadoAnterior: CadastroUsuarioState,
  formData: FormData,
): Promise<CadastroUsuarioState> {
  const valores = {
    nome: String(formData.get('nome') ?? ''),
    email: String(formData.get('email') ?? ''),
    senha: String(formData.get('senha') ?? ''),
  };

  const parsed = cadastroUsuarioSchema.safeParse(valores);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<CampoCadastro, string>> = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0];
      if (typeof campo === 'string' && ehCampoDoFormulario(campo)) {
        fieldErrors[campo] ??= issue.message;
      }
    }
    return { ...CADASTRO_INICIAL, fieldErrors, valores: valoresSemSegredo(valores) };
  }

  // pt-BR (onboarding de empresa, 2026-10-21): o token de convite, quando
  // existe, é o que diz que a conta nasce NA empresa que CONVIDOU — o
  // `destino` do corpo. Ele chega pelo campo oculto do formulário, e o
  // NAVEGADOR não é fronteira de confiança: um token com formato errado é
  // recusado aqui, sem chamar a API.
  //
  // E a recusa é o que impede o pior desfecho — criar a conta "normal",
  // sem empresa nenhuma. A pessoa entraria, não pertenceria a empresa de
  // quem a convidou, e nada na tela diria por quê.
  //
  // ⚠️ A checagem vem DEPOIS da validação dos campos: quem digitou o
  // e-mail errado num link quebrado precisa corrigir o e-mail primeiro, e
  // os valores digitados voltam no estado — o link é reavaliado no envio
  // seguinte, sem ninguém redigitar nada.
  const rawConvite = formData.get('convite');
  const convite = rawConvite === null ? null : String(rawConvite);
  if (convite !== null && !ehTokenDeConvite(convite)) {
    return {
      ...CADASTRO_INICIAL,
      valores: valoresSemSegredo(valores),
      formError: 'O link de convite é inválido. Peça um novo convite ao administrador da empresa.',
    };
  }

  const corpo: CreateUserInputDto =
    convite === null
      ? parsed.data
      : { ...parsed.data, destino: { tipo: 'convite', token: convite } };

  const api = new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
  });

  let erro: unknown;
  try {
    await api.post('/users', corpo);
  } catch (e) {
    erro = e;
  }

  // pt-BR: o `redirect` fica FORA do `try`. Ele funciona lançando uma
  // exceção NEXT_REDIRECT; um `try/catch` em volta engoliria o sinal de
  // navegação e a pessoa ficaria parada no formulário, com o usuário
  // criado, sem nenhuma indicação disso.
  //
  // ⚠️ O destino é o LOGIN, e não `/users`. O cadastro é `@Public()` e NÃO
  // emite sessão — `POST /users` devolve só o usuário, sem par de tokens
  // (é `POST /auth/login` que assina), então quem acabou de se cadastrar
  // não tem cookie nenhum. `/users` chama `exigirSessao()`, que sem cookie
  // redireciona para `/login`. Redirecionar para lá era um beco sem saída de
  // dois saltos, e a pessoa que acabara de ESCOLHER a senha era obrigada a
  // digitá-la de novo sem nenhum aviso de por quê.
  //
  // O `?cadastrado=1` existe para o login abrir com uma linha de confirmação
  // em vez de um formulário mudo — sem ele, o redirecionamento continua
  // silencioso, só que em vez de duas telas sem contexto é uma.
  if (erro instanceof ApiError) {
    return estadoDeErro(erro, valores);
  }
  if (erro) {
    // Falha de rede, resposta sem corpo JSON, exceção inesperada: nenhuma
    // delas chega como ApiError, e todas precisam virar mensagem na tela
    // em vez de estourar para o error boundary.
    return { ...CADASTRO_INICIAL, valores: valoresSemSegredo(valores), formError: ERRO_GENERICO };
  }

  redirect('/login?cadastrado=1');
}
