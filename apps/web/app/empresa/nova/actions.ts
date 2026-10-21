// apps/web/app/empresa/nova/actions.ts
//
// Server Action da criação de empresa.
//
// pt-BR: quatro responsabilidades, nesta ordem.
//  1. Validar de novo no servidor. O formulário valida com o mesmo schema
//     Zod no cliente, mas o cliente não é fronteira de confiança: o `POST`
//     pode chegar de fora do formulário.
//  2. Traduzir a resposta de erro da API em algo que o formulário saiba
//     exibir — por campo quando dá, no topo quando não dá.
//  3. Guardar a empresa nova como a empresa da sessão (cookie `tenant_id`).
//  4. Redirecionar para a listagem no sucesso.
//
// ⚠️ O token chega por PARÂMETRO para `criarEmpresa` (`lib/empresas.ts`) e
// não pelo cookie: é a rota "por CONTA", e o `X-Tenant-Id` de quem ainda não
// tem empresa nenhuma seria 403 `TENANT_MEMBERSHIP_REQUIRED` — a resposta
// certa seria logo depois de criada.

'use server';

import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api-client';
import { empresaSchema, type CampoEmpresa } from '@/lib/empresa-schema';
import { criarEmpresa } from '@/lib/empresas';
import { exigirSessao, guardarTenant } from '@/lib/sessao';
import type { EmpresaDto } from '@projeto/shared-types';
import { EMPRESA_INICIAL, ERRO_GENERICO, comTraceId, type EmpresaState } from './state';

const CAMPOS: CampoEmpresa[] = ['nome', 'slug'];

function ehCampoDoFormulario(campo: string): campo is CampoEmpresa {
  return (CAMPOS as string[]).includes(campo);
}

/**
 * Converte a falha da API no estado que o formulário consome.
 *
 * pt-BR: dois destinos, nesta ordem de precedência.
 * - `EMPRESA_JA_EXISTE` → campo `slug`. É o único caso em que o backend
 *   confirma um conflito com um campo específico, e o campo é o identificador
 *   — o que a pessoa precisa corrigir é o identificador, não o nome.
 * - `errors[]` → cada `field` que o formulário conhece vira erro de campo.
 * - qualquer coisa mais → topo do formulário, com traceId.
 *
 * Um `errors[]` cujo campo não existe no formulário NÃO é descartado: ele é
 * somado ao topo. Descartar seria a mesma falha de um log em inglês numa
 * tela pt-BR — a pessoa ficaria sem nenhuma explicação visível.
 */
function estadoDeErro(erro: ApiError, valores: EmpresaState['valores']): EmpresaState {
  const { problem } = erro;
  const base = { ...EMPRESA_INICIAL, valores };

  if (problem.code === 'EMPRESA_JA_EXISTE') {
    return { ...base, fieldErrors: { slug: 'Já existe uma empresa com este identificador.' } };
  }

  const fieldErrors: Partial<Record<CampoEmpresa, string>> = {};
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

export async function criarEmpresaDoAtor(
  _estadoAnterior: EmpresaState,
  formData: FormData,
): Promise<EmpresaState> {
  const valores = {
    nome: String(formData.get('nome') ?? ''),
    slug: String(formData.get('slug') ?? ''),
  };

  const parsed = empresaSchema.safeParse(valores);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<CampoEmpresa, string>> = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0];
      if (typeof campo === 'string' && ehCampoDoFormulario(campo)) {
        fieldErrors[campo] ??= issue.message;
      }
    }
    return { ...EMPRESA_INICIAL, fieldErrors, valores };
  }

  // pt-BR: a sessão é exigida ANTES de qualquer chamada. Sem cookie, a API
  // responderia 401 e a pessoa leria "não foi possível criar a empresa" —
  // uma mensagem de rede para um problema de sessão.
  const accessToken = await exigirSessao();

  let erro: unknown;
  let empresa: EmpresaDto | null = null;
  try {
    empresa = await criarEmpresa(accessToken, parsed.data);
  } catch (e) {
    erro = e;
  }

  // pt-BR: o `redirect` fica FORA do `try`. Ele funciona lançando uma
  // exceção NEXT_REDIRECT; um `try/catch` em volta engoliria o sinal de
  // navegação e a pessoa ficaria parada no formulário, com a empresa criada,
  // sem nenhuma indicação disso.
  if (erro instanceof ApiError) {
    // pt-BR: 401 é SESSÃO VENCIDA, não erro de formulário — o access token
    // dura 15 min e a pessoa pode ter ficado na tela mais que isso. Sem
    // isto ela leria "verifique a conexão" e tentaria de novo, com o mesmo
    // token velho. O repo já faz assim em `app/users/page.tsx`.
    if (erro.status === 401) {
      redirect('/login');
    }
    return estadoDeErro(erro, valores);
  }
  if (erro) {
    // Falha de rede, resposta sem corpo JSON, exceção inesperada: nenhuma
    // delas chega como ApiError, e todas precisam virar mensagem na tela em
    // vez de estourar para o error boundary.
    return { ...EMPRESA_INICIAL, valores, formError: ERRO_GENERICO };
  }
  if (!empresa) {
    // Um 201 SEM corpo é o mesmo defeito que o login tratou: a empresa
    // teria sido criada, mas não há id para apontar a sessão — e sem empresa
    // na sessão a pessoa cai no `/users` sem escopo, sem entender por quê.
    return { ...EMPRESA_INICIAL, valores, formError: ERRO_GENERICO };
  }

  // pt-BR: a empresa criada passa a ser a empresa DA SESSÃO. Sem este cookie
  // a pessoa cai no `/users` sem escopo, e a listagem volta vazia sem dizer
  // por quê.
  await guardarTenant(empresa.id);

  redirect('/users');
}
