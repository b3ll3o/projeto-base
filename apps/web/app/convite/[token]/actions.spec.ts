// apps/web/app/convite/[token]/actions.spec.ts
//
// Contrato da Server Action de aceite de convite.
//
// pt-BR (onboarding de empresa, 2026-10-21): o aceite é o que põe a conta
// NA empresa que convidou — e o cookie `tenant_id` é o que faz a sessão
// agir nela. Sem os dois, a membership existe e a tela não mostra nada.
//
// `@/lib/empresas` é mockado: o contrato do CLIENTE (a rota, o corpo, o
// header) é medido em `lib/empresas.spec.ts`. Aqui o que se mede é a
// decisão da Action — aceita, grava o cookie, redireciona.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { aceitarConviteDoAtor } from './actions';
import { CONVITE_INICIAL } from './state';
import { aceitarConvite } from '@/lib/empresas';
import { guardarTenant, lerTokens } from '@/lib/sessao';
import { ApiError } from '@/lib/api-client';
import type { ConviteAceitoDto } from '@projeto/shared-types';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/sessao', () => ({
  // ⚠️ `lerTokens`, e não `exigirSessao`: a Action confere a sessão LEENDO
  // os tokens, porque precisa preservar o token do convite no redirect quando
  // não há sessão — e o `exigirSessao()` redireciona para `/login` sem ele.
  lerTokens: vi.fn(async () => ({ accessToken: 'token-ator', refreshToken: 'refresh-ator' })),
  exigirSessao: vi.fn(async () => 'token-ator'),
  guardarTenant: vi.fn(async () => undefined),
}));

vi.mock('@/lib/empresas', () => ({
  aceitarConvite: vi.fn(async () => ({ aceito: true, tenantId: 'empresa-9' })),
}));

/**
 * O erro que a API devolve, no envelope RFC 7807.
 *
 * É o `ApiError` DE VERDADE, e não um objeto com o mesmo formato: a Action
 * decide por `instanceof`, e um teste que usasse um objeto falso mediria
 * o objeto falso.
 */
function apiError(status: number, code = 'CONVITE_INVALIDO'): ApiError {
  return new ApiError('Convite inválido', code, status, {
    type: 'about:blank',
    title: 'Convite inválido',
    status,
    detail: 'ConviteInvalidoException',
    instance: '/api/v1/invitations/accept',
    code,
    traceId: 'trace-123',
  });
}

const TOKEN = 'a'.repeat(64);

function formData(token: string | null = TOKEN): FormData {
  const fd = new FormData();
  if (token !== null) fd.set('token', token);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('aceitarConviteDoAtor — caminho feliz', () => {
  it('aceita o convite, aponta a sessão para a empresa e vai para a listagem', async () => {
    await expect(aceitarConviteDoAtor(CONVITE_INICIAL, formData())).rejects.toThrow(
      'NEXT_REDIRECT:/users',
    );

    expect(aceitarConvite).toHaveBeenCalledWith('token-ator', TOKEN);
    // pt-BR: o cookie `tenant_id` é o que faz a sessão agir NA empresa que
    // convidou. Sem ele, a membership existe e a listagem volta vazia sem
    // dizer por quê.
    expect(guardarTenant).toHaveBeenCalledWith('empresa-9');
  });

  it('o redirect vem DEPOIS do cookie — a página nova já nasce com a empresa', async () => {
    // pt-BR: a ordem importa porque `redirect` LANÇA. Gravar o cookie depois
    // do `redirect` é código que nunca roda — e a pessoa cairia no `/users`
    // sem empresa, que é o defeito que esta tela existe para consertar.
    const ordem: string[] = [];
    vi.mocked(guardarTenant).mockImplementation(async () => {
      ordem.push('cookie');
    });
    vi.mocked(redirect).mockImplementation((url: string) => {
      ordem.push(`redirect:${url}`);
      throw new Error(`NEXT_REDIRECT:${url}`);
    });

    await expect(aceitarConviteDoAtor(CONVITE_INICIAL, formData())).rejects.toThrow();

    expect(ordem).toEqual(['cookie', 'redirect:/users']);
  });
});

describe('aceitarConviteDoAtor — recusas', () => {
  it('token com formato errado não chega à API', async () => {
    const r = await aceitarConviteDoAtor(CONVITE_INICIAL, formData('token-adulterado'));

    expect(aceitarConvite).not.toHaveBeenCalled();
    expect(r.formError).toBeTruthy();
  });

  it('convite expirado diz que expirou — o que pede um convite NOVO', async () => {
    vi.mocked(aceitarConvite).mockRejectedValueOnce(apiError(410));

    const r = await aceitarConviteDoAtor(CONVITE_INICIAL, formData());

    expect(r.formError).toContain('expirou');
    expect(guardarTenant).not.toHaveBeenCalled();
  });

  it('convite já usado diz que já foi usado', async () => {
    vi.mocked(aceitarConvite).mockRejectedValueOnce(apiError(409));

    const r = await aceitarConviteDoAtor(CONVITE_INICIAL, formData());

    expect(r.formError).toContain('já foi usado');
  });

  it('conta que JÁ é da empresa diz isso — não "já foi usado"', async () => {
    // MEDIDO 2026-10-22: `ja-membro` e `ja-aceito` são o MESMO status (409),
    // e a tela dizia "Este convite já foi usado" para quem já era membro da
    // empresa. E era um beco sem saída: pedir um convite novo devolvia 409 de
    // novo, para sempre. O que resolve é dizer que a pessoa já é da empresa.
    vi.mocked(aceitarConvite).mockRejectedValueOnce(apiError(409, 'CONVITE_JA_MEMBRO'));

    const r = await aceitarConviteDoAtor(CONVITE_INICIAL, formData());

    expect(r.formError).toContain('já faz parte');
  });

  it('convite de outro e-mail diz que é de outro e-mail', async () => {
    vi.mocked(aceitarConvite).mockRejectedValueOnce(apiError(403));

    const r = await aceitarConviteDoAtor(CONVITE_INICIAL, formData());

    expect(r.formError).toContain('outro e-mail');
  });

  it('convite inexistente diz que não foi encontrado', async () => {
    vi.mocked(aceitarConvite).mockRejectedValueOnce(apiError(404));

    const r = await aceitarConviteDoAtor(CONVITE_INICIAL, formData());

    expect(r.formError).toContain('não encontrado');
  });

  it('falha inesperada vira mensagem genérica, sem vazar o título da API', async () => {
    vi.mocked(aceitarConvite).mockRejectedValueOnce(apiError(500, 'INTERNAL_ERROR'));

    const r = await aceitarConviteDoAtor(CONVITE_INICIAL, formData());

    expect(r.formError).not.toContain('Erro interno');
    expect(r.formError).toContain('Não foi possível aceitar o convite');
  });

  it('rede caída vira mensagem genérica, sem estourar', async () => {
    vi.mocked(aceitarConvite).mockRejectedValueOnce(new TypeError('fetch failed'));

    const r = await aceitarConviteDoAtor(CONVITE_INICIAL, formData());

    expect(r.ok).toBe(false);
    expect(r.formError).toBeTruthy();
  });

  it('nenhum erro redireciona — a pessoa continua na tela do convite', async () => {
    vi.mocked(aceitarConvite).mockRejectedValueOnce(apiError(409));

    await aceitarConviteDoAtor(CONVITE_INICIAL, formData());

    expect(vi.mocked(redirect)).not.toHaveBeenCalled();
  });
});

describe('aceitarConviteDoAtor — sessão vencida (401)', () => {
  it('um 401 é SESSÃO VENCIDA: leva ao login COM o token do convite, não a "verifique a conexão"', async () => {
    // pt-BR: o convite é válido — o token da SESSÃO é que não. Sem isto a
    // pessoa leria "não foi possível aceitar o convite" e ficaria presa nesta
    // tela, porque o `redirect` do sucesso é o único caminho de saída.
    //
    // ⚠️ O token vai JUNTO (2026-10-21): sem ele, a pessoa entra no login sem
    // convite nenhum, o funil pergunta "qual empresa?" e a responde
    // `/empresa/nova` — porque o convite AINDA NÃO foi aceito e a conta não
    // tem membership nenhuma. A pessoa criava a PRÓPRIA empresa, e o
    // convite de quem a convidou nunca era usado.
    vi.mocked(aceitarConvite).mockRejectedValueOnce(apiError(401, 'UNAUTHORIZED'));

    await expect(aceitarConviteDoAtor(CONVITE_INICIAL, formData())).rejects.toThrow(
      `NEXT_REDIRECT:/login?convite=${TOKEN}`,
    );

    expect(vi.mocked(redirect)).toHaveBeenCalledWith(`/login?convite=${TOKEN}`);
  });

  it('sem sessão: leva ao login COM o token do convite — sem ele, a pessoa perde o convite', async () => {
    // pt-BR (2026-10-22): a sessão pode sumir entre a página e o clique — o
    // cookie é de SESSÃO (sem `maxAge`), e logout em outra aba ou browser
    // reiniciado o apagam. O `exigirSessao()` redirecionava para `/login`
    // SEM o token, e a pessoa entrava no login sem convite nenhum: o funil
    // perguntava "qual empresa?" e a levava para `/empresa/nova` — porque o
    // convite AINDA NÃO foi aceito e a conta não tem membership nenhuma. A
    // pessoa criava a PRÓPRIA empresa, e o convite de quem a convidou nunca
    // era usado.
    vi.mocked(lerTokens).mockResolvedValueOnce({ accessToken: null, refreshToken: null });

    await expect(aceitarConviteDoAtor(CONVITE_INICIAL, formData())).rejects.toThrow(
      `NEXT_REDIRECT:/login?convite=${TOKEN}`,
    );

    expect(vi.mocked(redirect)).toHaveBeenCalledWith(`/login?convite=${TOKEN}`);
    // E nada foi aceito: o convite continua de pé.
    expect(aceitarConvite).not.toHaveBeenCalled();
    expect(guardarTenant).not.toHaveBeenCalled();
  });

  it('resposta SEM corpo: vira mensagem genérica, e não deixa a sessão sem empresa', async () => {
    // pt-BR (2026-10-22): um 201 sem corpo é o mesmo defeito que o login e a
    // criação de empresa já trataram. Desestruturar a resposta vazia estoura
    // um `TypeError` — que a tela leria como "verifique a conexão", com a
    // membership JÁ criada do lado da API e o convite já queimado: a pessoa
    // clicava de novo e lia "este convite já foi usado", sem nunca ter usado,
    // e sem empresa na sessão.
    vi.mocked(aceitarConvite).mockResolvedValueOnce(undefined as unknown as ConviteAceitoDto);

    const estado = await aceitarConviteDoAtor(CONVITE_INICIAL, formData());

    expect(estado.formError).toBeTruthy();
    // ⚠️ O cookie NÃO é gravado: sem `tenantId` não há empresa para apontar,
    // e gravar uma string vazia seria pior que não gravar.
    expect(guardarTenant).not.toHaveBeenCalled();
  });
});
