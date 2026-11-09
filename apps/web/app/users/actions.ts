// apps/web/app/users/actions.ts
//
// Server Actions da listagem de usuários.
//
// pt-BR: mora em `app/users/` e não em `app/login/` porque quem a chama é a
// tela de listagem — a tela de login não tem "Sair", porque ninguém chegou
// nela logado.
//
// pt-BR (por que o `redirect` depois de limpar): sem ele, o Next responderia a
// Server Action re-renderizando a MESMA página, agora com o cookie removido.
// A listagem chama `exigirSessao()` no topo, que por sua vez redireciona — ou
// seja, a pessoa veria a listagem piscar antes de ir para o login. Com o
// redirect aqui, a ida é uma navegação só.

'use server';

import { redirect } from 'next/navigation';
import { limparSessao, lerTokens } from '@/lib/sessao';
import { ApiClient } from '@/lib/api-client';

/**
 * O prazo da revogação, em ms (#132).
 *
 * ⚠️ 2 s, e não os 10 s do `ApiClient`: o logout é uma operação de
 * limpeza. Uma API que aceita a conexão e não responde deixaria o botão
 * "Sair" travado por 10 s — e o logout é a única coisa que a pessoa fez.
 */
const PRAZO_DE_REVOGACAO_MS = 2_000;

/**
 * Apaga os cookies de sessão e devolve a pessoa para a tela de login.
 *
 * ⚠️ (#132) O "sair" REVOGA o refresh token no backend — e não só apaga o
 * cookie. Sem a revogação, o token continuava válido no servidor por 7 dias:
 * qualquer cópia dele (log de proxy, backup do browser, dispositivo
 * compartilhado) servia para renovar a sessão, e o "sair" era só uma
 * limpeza de cookie.
 *
 * ⚠️ A revogação é TENTADA, e a falha NÃO impede o logout: se a API estiver
 * fora do ar, a pessoa ainda tem que conseguir sair da tela. O pior caso
 * é o token ficar vivo no servidor — que é exatamente o estado anterior ao
 * #132, e não um estado novo.
 *
 * ⚠️ E a falha NÃO é silenciosa: ela é LOGADA. A revogação é justamente o
 * controle que a #132 entrega, e uma API que responde 500 em todo logout
 * (ex.: `SYSTEM_DATABASE_URL` ausente) seria INDETECTÁVEL — a pessoa sai, o
 * cookie some, e o token vive 7 dias sem que ninguém saiba.
 *
 * ⚠️ O PRAZO é de 2 s (e não os 10 s do `ApiClient`): o logout é uma
 * operação de limpeza, e esperar 10 s com o botão "Sair" pressionado é uma
 * tela travada.
 */
export async function sair(_formData: FormData): Promise<void> {
  const { refreshToken } = await lerTokens();

  if (refreshToken !== null) {
    try {
      const api = new ApiClient({
        baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
        defaultTimeoutMs: PRAZO_DE_REVOGACAO_MS,
      });
      await api.post('/auth/logout', { refreshToken });
    } catch (erro) {
      // A API fora do ar não pode travar o logout — o cookie é apagado
      // logo abaixo de qualquer jeito. Mas o token continua VIVO no servidor,
      // e isso precisa aparecer em algum log.
      console.error('[web] o logout não revogou o refresh token na API', erro);
    }
  }

  await limparSessao();

  redirect('/login');
}
