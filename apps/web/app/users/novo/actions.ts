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
import { CADASTRO_INICIAL, ERRO_GENERICO, comTraceId, type CadastroUsuarioState } from './state';

const CAMPOS: CampoCadastro[] = ['nome', 'email'];

function ehCampoDoFormulario(campo: string): campo is CampoCadastro {
  return (CAMPOS as string[]).includes(campo);
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
  const base = { ...CADASTRO_INICIAL, valores };

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
    return { ...CADASTRO_INICIAL, fieldErrors, valores };
  }

  const api = new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
  });

  let erro: unknown;
  try {
    await api.post('/users', parsed.data);
  } catch (e) {
    erro = e;
  }

  // pt-BR: o `redirect` fica FORA do `try`. Ele funciona lançando uma
  // exceção NEXT_REDIRECT; um `try/catch` em volta engoliria o sinal de
  // navegação e a pessoa ficaria parada no formulário, com o usuário
  // criado, sem nenhuma indicação disso.
  if (erro instanceof ApiError) {
    return estadoDeErro(erro, valores);
  }
  if (erro) {
    // Falha de rede, resposta sem corpo JSON, exceção inesperada: nenhuma
    // delas chega como ApiError, e todas precisam virar mensagem na tela
    // em vez de estourar para o error boundary.
    return { ...CADASTRO_INICIAL, valores, formError: ERRO_GENERICO };
  }

  redirect('/users');
}
