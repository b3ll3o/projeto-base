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
import { redirect } from 'next/navigation';
import { Alerta } from '@/components/ui/alerta';
import { Botao } from '@/components/ui/botao';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Container } from '@/components/ui/container';
import { EstadoVazio } from '@/components/ui/estado-vazio';
import { ApiClient, ApiError, baseUrlDaApi } from '@/lib/api-client';
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

export default async function UsersPage() {
  const accessToken = await exigirSessao();

  const tenantId = await lerTenant();
  const api = new ApiClient({
    baseUrl: baseUrlDaApi(),
    getToken: () => accessToken,
    getTenant: () => tenantId,
  });

  let data: UsersPageDto | null = null;
  let error: string | null = null;
  try {
    data = await api.get<UsersPageDto>('/users?limit=20');
  } catch (err) {
    // pt-BR: 401 aqui NÃO é erro de rede — é sessão que expirou (o access
    // token vive 15min, contrato (F)). A pessoa precisa voltar ao login, e
    // mostrar "Não foi possível carregar a lista" para isso seria mandar
    // quem tem um problema de credencial procurar problema de conexão.
    //
    // O `redirect` lança NEXT_REDIRECT e sai da função; ele está DENTRO do
    // `catch` e não dentro de outro `try`, então não há nada que o engula.
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login');
    }
    error = err instanceof Error ? err.message : 'Erro desconhecido';
    // pt-BR (padrão de estilização, 2026-11-11): a tela NÃO cola a exceção
    // crua na mensagem. O que a pessoa precisa saber é que a lista não veio
    // e o que ela pode fazer; a exceção crua (que pode ser o número HTTP, ou
    // uma frase do proxy) é do log do servidor, que é onde o diagnóstico
    // vive. A mensagem da tela é a mesma para toda falha de leitura.
    console.error('[web] listagem de usuários', error);
  }

  const usuarios = data?.users ?? [];

  return (
    <Container>
      <CabecalhoPagina
        titulo="Usuários"
        descricao={
          error
            ? 'Não foi possível carregar a lista.'
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
        {error ? (
          <Alerta variante="erro">Erro ao carregar: tente de novo em instantes.</Alerta>
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
            {usuarios.map((u: UserOutputDto) => (
              <li key={u.id} className="rounded-md bg-surface p-4">
                <div className="font-medium text-foreground">{u.nome}</div>
                <div className="text-sm text-muted-foreground">{u.email}</div>
                <div className="mt-1 text-xs text-muted-foreground">v{u.version}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
