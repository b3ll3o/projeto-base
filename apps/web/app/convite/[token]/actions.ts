// apps/web/app/convite/[token]/actions.ts
//
// Server Action do aceite de convite.
//
// pt-BR (onboarding de empresa, 2026-10-21): este é o caminho de quem JÁ
// TEM CONTA e recebeu um convite. Quem não tem conta entra pelo cadastro
// (`POST /users` com `destino.tipo='convite'`), que cria a conta e a
// membership na mesma transação.
//
// Três responsabilidades, nesta ordem:
//  1. Recusar um token que não tem o formato — sem ir à API.
//  2. Aceitar o convite e GRAVAR o cookie `tenant_id`, que é o que faz a
//     sessão agir na empresa que convidou.
//  3. Redirecionar para a listagem.
//
// ⚠️ O `redirect` fica FORA do `try`: ele funciona lançando NEXT_REDIRECT, e
// um `catch` em volta engoliria o sinal de navegação. E o cookie é gravado
// ANTES dele — gravar depois é código que nunca roda.

'use server';

import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api-client';
import { ehTokenDeConvite, PARAM_CONVITE } from '@/lib/convite-schema';
import { aceitarConvite } from '@/lib/empresas';
import { lerTokens, guardarTenant } from '@/lib/sessao';
import {
  CONVITE_ERRO_GENERICO,
  CONVITE_INVALIDO,
  mensagemDeConvite,
} from '@/lib/convite-mensagens';
import { CONVITE_INICIAL, comTraceId, type ConviteState } from './state';
import type { ConviteAceitoDto } from '@projeto/shared-types';

/**
 * A mensagem que a pessoa lê quando o convite não vale.
 *
 * pt-BR: o motivo do convite está no STATUS, e não no corpo — a API não o
 * escreve no corpo por decisão de segurança (o `detail` não pode confirmar a
 * quem só tem o token que o convite existe). O status já distingue os
 * casos, e a distinção é o que a pessoa precisa para agir.
 *
 * ⚠️ O mapeamento é o MESMO da tela de cadastro (`@/lib/convite-mensagens`):
 * as duas portas do convite falam do mesmo motivo, e o que muda entre elas é
 * só a mensagem genérica — cada tela diz o que a pessoa tentou fazer.
 */
function mensagemDoConvite(erro: ApiError): string {
  return mensagemDeConvite(erro.status) ?? comTraceId(CONVITE_ERRO_GENERICO, erro.problem?.traceId);
}

export async function aceitarConviteDoAtor(
  _estadoAnterior: ConviteState,
  formData: FormData,
): Promise<ConviteState> {
  const token = String(formData.get('token') ?? '');

  // pt-BR: o token vem do campo oculto do formulário, e o NAVEGADOR não é
  // fronteira de confiança. O formato é o que a API exige (64 hex); um
  // token adulterado morre aqui, sem ida ao banco.
  if (!ehTokenDeConvite(token)) {
    return { ...CONVITE_INICIAL, formError: CONVITE_INVALIDO };
  }

  // pt-BR: a sessão é conferida ANTES do `try` — um `catch` em volta
  // engoliria o sinal de navegação e a pessoa ficaria na tela do convite sem
  // explicação.
  //
  // ⚠️ O token do convite vai JUNTO no redirect. Sem ele, a pessoa entra no
  // login sem convite nenhum, o funil pergunta "qual empresa?" e a leva para
  // `/empresa/nova` — porque o convite AINDA NÃO foi aceito e a conta não tem
  // membership nenhuma. A pessoa criava a PRÓPRIA empresa, e o convite de
  // quem a convidou nunca era usado. O ramo 401, lá embaixo, já faz isso (a
  // sessão pode vencer ENTRE a página e o clique); este é o MESMO cuidado no
  // caminho da sessão que nunca existiu.
  const { accessToken } = await lerTokens();
  if (!accessToken) {
    redirect(`/login?${PARAM_CONVITE}=${token}`);
  }

  let aceite: ConviteAceitoDto | null = null;
  try {
    aceite = await aceitarConvite(accessToken, token);
  } catch (erro) {
    // pt-BR: 401 é SESSÃO VENCIDA — o convite é válido, o token da sessão é
    // que não. Sem isto a pessoa leria "verifique a conexão" e ficaria presa
    // nesta tela, porque o `redirect` abaixo é o único caminho de saída.
    //
    // ⚠️ O token vai JUNTO: sem ele, a pessoa entra no login sem convite
    // nenhum, o funil pergunta "qual empresa?" e a responde `/empresa/nova` —
    // porque o convite AINDA NÃO foi aceito e a conta não tem membership
    // nenhuma. A pessoa criava a PRÓPRIA empresa, e o convite de quem a
    // convidou nunca era usado.
    if (erro instanceof ApiError && erro.status === 401) {
      redirect(`/login?${PARAM_CONVITE}=${token}`);
    }
    return {
      ...CONVITE_INICIAL,
      formError: erro instanceof ApiError ? mensagemDoConvite(erro) : CONVITE_ERRO_GENERICO,
    };
  }

  // ⚠️ Um 201 SEM corpo é o mesmo defeito que o login e a criação de empresa
  // já trataram: o `ApiClient` devolve `undefined` quando a resposta vem
  // vazia, e desestruturar `undefined` estoura um `TypeError` — que a tela
  // leria como "verifique a conexão", com a membership JÁ criada do lado da
  // API e o convite já queimado. A pessoa clicava de novo e lia "este convite
  // já foi usado", sem nunca ter usado, e sem empresa na sessão.
  if (!aceite?.tenantId) {
    return { ...CONVITE_INICIAL, formError: CONVITE_ERRO_GENERICO };
  }

  // pt-BR: o cookie `tenant_id` é o que faz a sessão agir NA empresa que
  // convidou. Sem ele, a membership existe e a listagem volta vazia sem
  // dizer por quê.
  await guardarTenant(aceite.tenantId);

  redirect('/users');
}
