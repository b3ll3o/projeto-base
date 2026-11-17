// apps/web/app/users/page.tsx
//
// Server Component: busca direto na API, sem useEffect.
//
// pt-BR (2026-10-06): esta página renderizava uma lista **vazia sem dizer
// nada**. O tipo declarado (`PaginatedResponse<UserOutputDto>`) prometia
// `{data, pagination}` e `user.name`, mas a API responde `{users,
// nextCursor}` e `nome` — então `data?.data.map()` era `undefined` e a tela
// mostrava só o título. O TypeScript não acusou porque o tipo Mentia na
// mesma direção que o runtime. Tipos compartilhados são cópia do wire
// format (ver `packages/shared-types/src/user.ts`).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alerta } from '@/components/ui/alerta';
import { Botao, CLASSES_BOTAO_SECUNDARIO } from '@/components/ui/botao';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Container } from '@/components/ui/container';
import { EstadoVazio } from '@/components/ui/estado-vazio';
import { ApiClient, ApiError, baseUrlDaApi } from '@/lib/api-client';
import { obterMeuPerfilGlobal } from '@/lib/perfil';
import { exigirSessao, lerTenant } from '@/lib/sessao';
import type { UserOutputDto, UsersPageDto } from '@projeto/shared-types';
import { sair } from './actions';

// pt-BR (2026-10-06): esta página busca na API, e mesmo assim o build a
// classificava como ESTÁTICA (`○` no output do `next build`) — o HTML
// ficava pronto com a lista do momento do build. Medido: o usuário
// "Teste Debug" estava escrito dentro de `.next/server/app/users.html`.
// Consequência: cadastrar alguém pelo formulário novo não aparecia na
// listagem até o próximo build, sem nenhum erro em lugar nenhum.
//
// `force-dynamic` diz ao Next que o conteúdo depende de requisição. É a
// correção certa aqui e não a mais broadly correcta: a alternativa seria
// desligar o cache todo do app por causa de uma página.
//
// pt-BR (Fase 8): a listagem passou a exigir sessão. `exigirSessao()` vem
// ANTES de qualquer chamada à API e devolve o access token, que entra no
// `ApiClient` pela seam `getToken` — a seam que existia em
// `lib/api-client.ts` e nunca tinha sido usada. Sem ela a API responderia
// 401 a toda requisição, e esta página cairia no tratamento genérico de
// erro, que diz "Não foi possível carregar a lista" — uma mensagem de rede
// para um problema de sessão.
export const dynamic = 'force-dynamic';

/**
 * A superfície da linha da listagem — a mesma nos dois ramos (clicável ou
 * texto).
 *
 * pt-BR: o `rounded-md bg-surface p-4` seria escrito à mão em DOIS ramos
 * (o link e o div), e a convenção `dry.md` diz que um termo tem UM dono. A
 * superfície é `bg-surface` + `rounded-md` — e o fio de 1px NÃO entra: a
 * convenção `estilizacao.md` §2.3 só admite divisória decorativa e dado
 * tabular.
 */
const SUPERFICIE_DA_LINHA = 'rounded-md bg-surface p-4';

/**
 * O ator é o ADMINISTRADOR DO SISTEMA? — TRÊS vereditos, não dois.
 *
 * pt-BR: `false` como resposta de TUDO era mentira. 5xx, timeout e rede caídos
 * viravam "não é admin", e o administrador do sistema via a lista SEM link e
 * SEM aviso — sem nenhum caminho para distinguir "a API do perfil caiu" de
 * "eu não sou administrador". Agora:
 *
 *   - `sim` → a linha abre o detalhe (a API respondeu, e disse que sim);
 *   - `nao` → a linha é texto (a API respondeu, e disse que não);
 *   - `indisponivel` → a linha é texto E a tela avisa — a leitura NÃO deu
 *     veredito, e o app diz isso em vez de fabricar um.
 *
 * A falha é FECHADA (sem link), e VISÍVEL (o `Alerta` da tela) — o que
 * impede o pior: o admin concluir que não é administrador do sistema.
 */
type VereditoDoAdmin = 'sim' | 'nao' | 'indisponivel';

async function ehAdminDoSistema(): Promise<VereditoDoAdmin> {
  try {
    // ⚠️ SEM token por parâmetro: o token vem do COOKIE, e é o mesmo que o
    // `Sidebar` (o layout) usa — as duas leituras caem no MESMO memo do
    // `React.cache` (`lib/perfil.ts`), e a página não faz uma segunda
    // requisição HTTP do mesmo perfil.
    const me = await obterMeuPerfilGlobal();
    // `null` é o 401 — token expirado. A listagem leva 401 também, e o
    // `redirect('/login')` dela trata; aqui é "não deu para confirmar".
    if (me === null) return 'indisponivel';
    return me.isAdmin === true ? 'sim' : 'nao';
  } catch {
    // 403, 5xx, timeout e rede: a API não deu veredito. A linha fica texto
    // (falha fechada) e a tela avisa.
    return 'indisponivel';
  }
}

/**
 * A LISTAGEM, lida em separado — e o `401` é sessão que expirou.
 *
 * pt-BR: 401 aqui NÃO é erro de rede — é sessão que expirou (o access token
 * vive 15min, contrato (F)). A pessoa precisa voltar ao login, e mostrar
 * "Não foi possível carregar a lista" para isso seria mandar quem tem um
 * problema de credencial procurar problema de conexão.
 *
 * O `redirect` lança NEXT_REDIRECT e sai da função; ele está DENTRO do
 * `catch` e não dentro de outro `try`, então não há nada que o engula.
 */
async function lerLista(api: ApiClient): Promise<{
  data: UsersPageDto | null;
  error: string | null;
}> {
  try {
    return { data: await api.get<UsersPageDto>('/users?limit=20'), error: null };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login');
    }
    const error = err instanceof Error ? err.message : 'Erro desconhecido';
    // pt-BR (padrão de estilização, 2026-11-11): a tela NÃO cola a exceção
    // crua na mensagem. O que a pessoa precisa saber é que a lista não veio
    // e o que ela pode fazer; a exceção crua (que pode ser o número HTTP, ou
    // uma frase do proxy) é do log do servidor, que é onde o diagnóstico
    // vive. A mensagem da tela é a mesma para toda falha de leitura.
    console.error('[web] listagem de usuários', error);
    return { data: null, error };
  }
}

export default async function UsersPage() {
  const accessToken = await exigirSessao();

  const tenantId = await lerTenant();
  const api = new ApiClient({
    baseUrl: baseUrlDaApi(),
    getToken: () => accessToken,
    getTenant: () => tenantId,
  });

  // pt-BR: as DUAS leituras correm EM PARALELO. O `isAdmin` GLOBAL é o do
  // bucket de sistema (D8) — o da empresa é o do DONO, e usá-lo abriria o
  // inventário da tenancy para um gerente que a API recusa com 403. E
  // serializadas, elas somavam dois prazos de timeout (10 s cada) na tela
  // principal, com o LCP esperando a segunda.
  //
  // ⚠️ A leitura do perfil NÃO pode derrubar a listagem: quem não é admin do
  // sistema vê a lista como sempre, e uma API fora do ar no perfil não pode
  // levar a listagem embora. O que ela faz é decidir se a linha ABRE — e,
  // quando não dá veredito, a tela DIZ que não deu (o `Alerta` abaixo).
  const [veredito, { data, error }] = await Promise.all([ehAdminDoSistema(), lerLista(api)]);

  const usuarios = data?.users ?? [];

  return (
    <Container>
      <CabecalhoPagina
        titulo="Usuários"
        // ⚠️ Na falha, o cabeçalho NÃO repete a mensagem do `Alerta` (MEDIDO
        // 2026-11-16, revisão do PR #168): a tela dizia "Não foi possível
        // carregar a lista." no cabeçalho E "Erro ao carregar: tente de novo
        // em instantes." no alerta — DUAS mensagens para o MESMO estado. E a
        // contagem ("0 usuários cadastrados") seria MENTIRA: a leitura
        // falhou, não veio vazia. O estado de erro é o `Alerta`, e só ele.
        descricao={
          error
            ? undefined
            : `${usuarios.length} ${usuarios.length === 1 ? 'usuário cadastrado' : 'usuários cadastrados'}`
        }
        acao={
          <>
            <Botao href="/users/novo">Cadastrar usuário</Botao>
            {/* pt-BR: "Sair" é um formulário, não um link. Um `<a href>` que
                apagasse cookie não teria Server Action para reescrever o
                cookie — o navegador não pode mudar cookie do servidor. E não
                é botão com `onClick`: esta página é Server Component, e sem
                'use client' não há manipulador de evento. */}
            <form action={sair}>
              <Botao type="submit" variante="secundario">
                Sair
              </Botao>
            </form>
          </>
        }
      />

      <div className="mt-6">
        {veredito === 'indisponivel' ? (
          // ⚠️ A leitura do perfil FALHOU, e a lista continua de pé — mas sem o
          // link. Sem este aviso, o administrador do sistema via a lista sem
          // link e sem explicação, e o veredito errado era "eu não sou
          // administrador". O `Alerta` é o estado de ERRO da tela (a convenção
          // `estilizacao.md` §4.1), e a mensagem diz o que a pessoa perde.
          <div className="mb-3">
            <Alerta variante="erro">
              Não foi possível confirmar seu acesso de administrador do sistema. Por isso, as
              empresas de cada pessoa não aparecem aqui.
            </Alerta>
          </div>
        ) : null}
        {error ? (
          // pt-BR (revisão 2026-11-16): erro sem AÇÃO é erro sem saída — a
          // pessoa lê "tente de novo" e não tem onde tentar. O `<a href="">`
          // recarrega a página e reexecuta a leitura que falhou (o mesmo
          // caminho do `guard-admin`).
          <div className="space-y-3">
            <Alerta variante="erro">
              Não foi possível carregar a lista. Tente de novo em instantes.
            </Alerta>
            {/* ⚠️ É um `<a href="">` e não o `Botao`: esta página é Server
                Component, e um `onClick` exigiria um wrapper `'use client'`.
                O `href` vazio resolve para o documento atual e o browser
                recarrega a página, reexecutando a leitura que falhou (o
                mesmo caminho do `guard-admin`). */}
            <a href="" className={CLASSES_BOTAO_SECUNDARIO}>
              Tentar de novo
            </a>
          </div>
        ) : usuarios.length === 0 ? (
          // Estado vazio: informação + próximo passo. Não é erro, e não é a
          // mesma tela de "falhou ao carregar".
          <EstadoVazio
            titulo="Nenhum usuário cadastrado"
            descricao="Cadastre o primeiro usuário para começar."
            acao={<Botao href="/users/novo">Cadastrar usuário</Botao>}
          />
        ) : (
          <ul className="space-y-2">
            {usuarios.map((u: UserOutputDto) => {
              // pt-BR: o conteúdo do item é o MESMO nos dois ramos — o que
              // muda é se a pessoa é clicável. O clique leva ao detalhe, que
              // mostra as empresas dela: e o inventário da tenancy é
              // exclusivo do administrador do sistema.
              const conteudo = (
                <>
                  <div className="break-words font-medium text-foreground">{u.nome}</div>
                  <div className="break-words text-sm text-muted-foreground">{u.email}</div>
                  {/* ⚠️ `aria-hidden`: a versão é METADADO, e dentro do link
                      ela entrava no nome acessível ("Ana ana@x.dev v 3, link") —
                      o leitor de tela anunciava a versão como parte do
                      destino. O dado continua VISÍVEL; ele só para de ser
                      lido. */}
                  <div
                    aria-hidden="true"
                    className="mt-1 text-xs tabular-nums text-muted-foreground"
                  >
                    v{u.version}
                  </div>
                </>
              );
              return (
                <li key={u.id}>
                  {/* ⚠️ A SUPERFÍCIE É O ALVO, e não o `<li>`: com o
                      `p-4` no `<li>` e o link dentro dele, a faixa de 16px em
                      volta do texto era zona morta (não abria nada no toque)
                      e o anel de foco desenhava um retângulo solto da
                      superfície. É o card de `/users/[id]` que faz o
                      contrário — o link É a superfície. */}
                  {veredito === 'sim' ? (
                    <Link
                      href={`/users/${u.id}`}
                      className={`foco block ${SUPERFICIE_DA_LINHA} hover:bg-muted`}
                    >
                      {conteudo}
                    </Link>
                  ) : (
                    <div className={SUPERFICIE_DA_LINHA}>{conteudo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Container>
  );
}
