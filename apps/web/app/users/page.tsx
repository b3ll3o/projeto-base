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
import { ApiClient, ApiError } from '@/lib/api-client';
import { exigirSessao } from '@/lib/sessao';
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

  const api = new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1',
    getToken: () => accessToken,
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
  }

  const usuarios = data?.users ?? [];

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Usuários</h1>
          <p className="mt-1 text-sm text-slate-500">
            {error
              ? 'Não foi possível carregar a lista.'
              : `${usuarios.length} ${usuarios.length === 1 ? 'usuário cadastrado' : 'usuários cadastrados'}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/users/novo"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Cadastrar usuário
          </Link>
          {/* pt-BR: "Sair" é um formulário, não um link. Um `<a href>` que
              apagasse cookie não teria Server Action para reescrever o
              cookie — o navegador não pode mudar cookie do servidor. E não
              é botão com `onClick`: esta página é Server Component, e sem
              'use client' não há manipulador de evento. */}
          <form action={sair}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Sair
            </button>
          </form>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          Erro ao carregar: {error}
        </p>
      ) : usuarios.length === 0 ? (
        // Estado vazio: informação + próximo passo. Não é erro, e não é a
        // mesma tela de "falhou ao carregar".
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-12 text-center">
          <p className="text-sm font-medium text-slate-900">Nenhum usuário cadastrado</p>
          <p className="mt-1 text-sm text-slate-500">Cadastre o primeiro usuário para começar.</p>
          <Link
            href="/users/novo"
            className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Cadastrar usuário
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {usuarios.map((u: UserOutputDto) => (
            <li key={u.id} className="rounded border border-slate-200 bg-white p-4">
              <div className="font-medium text-slate-900">{u.nome}</div>
              <div className="text-sm text-slate-600">{u.email}</div>
              <div className="mt-1 text-xs text-slate-400">v{u.version}</div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
