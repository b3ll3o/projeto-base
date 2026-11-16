// apps/web/app/convite/[token]/aceitar-convite.tsx
//
// O botão de aceitar o convite.
//
// pt-BR (onboarding de empresa, 2026-10-21): é Client Component porque o
// `useActionState` precisa mostrar o erro na TELA — o mesmo desenho de
// `cadastro-usuario-form.tsx` e `empresa-form.tsx`.
//
// O token viaja como campo oculto porque é ele que a Action valida. Ele já
// está na URL (o link do convite), e o campo oculto não acrescenta
// exposição nenhuma.

'use client';

import { useActionState } from 'react';
import { Alerta } from '@/components/ui/alerta';
import { Botao } from '@/components/ui/botao';
import { PARAM_CONVITE } from '@/lib/convite-schema';
import { aceitarConviteDoAtor } from './actions';
import { CONVITE_INICIAL, type ConviteState } from './state';
import { LinkTexto } from '@/components/ui/link-texto';

export function AceitarConvite({ token }: { token: string }) {
  const [estado, despachar, pendente] = useActionState<ConviteState, FormData>(
    aceitarConviteDoAtor,
    CONVITE_INICIAL,
  );

  return (
    <form action={despachar} className="max-w-md space-y-5">
      <input type="hidden" name="token" value={token} />

      {estado.formError ? <Alerta variante="erro">{estado.formError}</Alerta> : null}

      <Botao type="submit" disabled={pendente}>
        {pendente ? 'Aceitando…' : 'Aceitar convite'}
      </Botao>

      {/* pt-BR (onboarding de empresa, 2026-10-21): esta é a ÚNICA tela do
          convite que a pessoa vê COM sessão — e ela pode estar logada na
          conta ERRADA. Sem esta saída a pessoa fica presa: o convite é de
          outro e-mail, e a tela só oferece "Aceitar", que vai falhar com
          "enviado para outro e-mail". O token viaja na query porque o login
          o leva de volta até aqui — e é o que faz o aceite voltar a
          funcionar depois da troca de conta. */}
      <LinkTexto href={`/login?${PARAM_CONVITE}=${token}`}>Entrar com outra conta</LinkTexto>
    </form>
  );
}
