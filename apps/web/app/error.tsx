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
import { Botao } from '@/components/ui/botao';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Container } from '@/components/ui/container';

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
    <Container>
      <CabecalhoPagina
        titulo="Algo deu errado ao carregar"
        descricao="Isto não é sobre o seu perfil nem sobre a sua conta. Tente de novo — se persistir, o serviço pode estar fora do ar."
      />
      <Botao
        type="button"
        variante="secundario"
        className="mt-4"
        onClick={() => {
          reset();
        }}
      >
        Tentar de novo
      </Botao>
      {error.digest !== undefined && (
        <p className="mt-4 font-mono text-xs text-muted-foreground">ref: {error.digest}</p>
      )}
    </Container>
  );
}
