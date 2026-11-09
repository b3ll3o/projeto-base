// FLUXO: F19 — Sair revoga o refresh token
// Cobre: o "Sair" apaga a sessão E revoga o refresh token na API — o token
// antigo deixa de renovar.
//
// pt-BR — por que este fluxo existe.
//
// A API tem e2e para a revogação (`apps/api/test/e2e/scenarios/
// 15-auth-revogacao.e2e.spec.ts`), e o web NÃO tinha NENHUM: nenhum spec
// clicava em "Sair". A camada que falta é a que atravessa browser, Next,
// Server Action e API HTTP no MESMO evento — e o "Sair" é justamente um
// Server Action que faz uma chamada de rede: o botão existir, o cookie
// sumir e o token morrer na API são três fatos que só o browser junta.
//
// O CONTROLE é o que dá dente ao resto: um 401 depois do "Sair" também
// acontece com um token que NUNCA renewal — e aí o spec passaria medindo
// nada. Por isso o primeiro teste prova que o token renova enquanto a
// sessão está viva, e o segundo prova que o MESMO par deixa de renovar
// depois do "Sair".

import { expect, plantarSessao, test } from './support/fixtures';
import { semearAdmin } from './support/rbac';
import { exigirEstado } from './support/estado';

/**
 * Tenta renovar a sessão com um refresh token.
 *
 * pt-BR: a chamada é feita pela API, e não pela tela — a tela não tem
 * "renovar", e o que este fluxo mede é o ESTADO do token no servidor.
 */
async function renovar(refreshToken: string): Promise<{ status: number; corpo: unknown }> {
  const { apiBaseUrl } = exigirEstado();
  const resposta = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const texto = await resposta.text();
  let corpo: unknown = null;
  try {
    corpo = texto === '' ? null : JSON.parse(texto);
  } catch {
    corpo = texto;
  }
  return { status: resposta.status, corpo };
}

test.describe('F19 — Sair revoga o refresh token', () => {
  test('CONTROLE: com a sessão viva, o refresh token renova', async () => {
    // A conta é semeada aqui, e não vem do harness: a conta do harness é
    // apagada em soft-delete ao nascer e o login dela devolve 401.
    const sessao = await semearAdmin();

    const renovacao = await renovar(sessao.tokens.refreshToken);

    // 201: o par novo foi emitido. É este 201 que dá sentido ao 401 do
    // teste seguinte — sem ele, o 401 seria indistinguível de "o token
    // nunca valia".
    expect(renovacao.status).toBe(201);
  });

  test('depois do "Sair", o refresh token da sessão NÃO renova mais', async ({ page, irPara }) => {
    const sessao = await semearAdmin();
    await plantarSessao(page, sessao.tokens);

    await irPara('/users');
    await page.getByRole('button', { name: 'Sair', exact: true }).click();

    // A pessoa volta ao login — o cookie de sessão foi apagado.
    await expect(page).toHaveURL(/\/login$/);

    // ⚠️ A ASSERÇÃO CENTRAL: o token que estava no cookie foi REVOGADO na
    // API. Sem o "Sair", a revogação não acontecia e o token continuaria
    // renovando por até 7 dias — que é o furo inteiro que a #132 fecha.
    const renovacao = await renovar(sessao.tokens.refreshToken);

    expect(renovacao.status).toBe(401);
    expect((renovacao.corpo as { code?: string }).code).toBe('INVALID_TOKEN');
  });
});
