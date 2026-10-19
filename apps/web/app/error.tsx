// apps/web/app/error.tsx
//
// pt-BR (achado 5, PR #108): este arquivo não existia, e a ausência era um
// problema depois que `obterMeuPerfil` passou a propagar erro (#107).
//
// Sem `error.tsx` nem `global-error.tsx`, uma exceção num Server Component vira
// a página de erro do Next — HTTP 500 genérico, sem o que a pessoa possa fazer.
// MEDIDO: `/me/profile` com a API em 502 respondia 500 cru.
//
// Este é o ÚLTIMO recurso: cada tela trata o que sabe tratar (o guard de
// `/admin/*` distingue 401/403/5xx, o Sidebar degrada sozinho). O que chega
// aqui é o que nenhuma delas pegou.
//
// ⚠️ `error.tsx` é Client Component: o Server Component que lançou já terminou,
// e o React entrega aqui o `reset()` para tentar de novo. Por isso o botão é um
// `<button>` e não um `<a>` — `reset()` re-renderiza o mesmo server component.

'use client';

import { useEffect } from 'react';

export default function ErroDePagina({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    // O log vai para o console do browser: sem `error.tsx` não havia NENHUM
    // registro do que derrubou a tela. O `digest` é o que amarra ao trace do
    // servidor — é o mesmo par que `UserPersistenceException` emite.
    console.error('[web] erro de página', error);
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Algo deu errado ao carregar</h1>
      <p className="mt-1 text-sm text-slate-500">
        Isto não é sobre o seu perfil nem sobre a sua conta. Tente de novo — se persistir, o serviço
        pode estar fora do ar.
      </p>
      <button
        type="button"
        onClick={() => {
          reset();
        }}
        className="mt-4 rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
      >
        Tentar de novo
      </button>
      {error.digest !== undefined && (
        <p className="mt-4 font-mono text-xs text-slate-400">ref: {error.digest}</p>
      )}
    </main>
  );
}
