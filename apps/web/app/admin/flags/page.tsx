// apps/web/app/admin/flags/page.tsx
//
// pt-BR (feature-flags, 2026-10-18 — Fase 5): a tela que o ADMINISTRADOR DO
// SISTEMA usa para ligar e desligar funcionalidades. Server Component.
//
// A checagem `isAdmin` no front é DUPLICA de propósito (mesma decisão declarada
// em `app/admin/profiles/page.tsx:6-11`) — mas ela NÃO é "mais estrita" que a
// da API, como o texto desta página dizia antes da revisão de 2026-10-18: é a
// **mesma** decisão, lida do mesmo sinal. D2 exige `isAdmin` do bucket GLOBAL
// (`ehAdministradorDeSistema`: `tenantId === null && isAdmin`), e por isso o
// guard chama `obterMeuPerfilGlobal()`. `obterMeuPerfil` — a variante por
// empresa — devolveria o `isAdmin` de DONO, que é `true` em toda empresa nova
// e não é o que a API olha: a tela mostraria a tabela para um ator que a API
// recusa. MEDIDO: `prisma-tenant-onboarding.repository.ts:202` dá
// `isAdmin: true` ao dono.
//
// Um form POR LINHA, e não um form com vários checkboxes: cada linha é a
// unidade de salvar — o mesmo formato de `app/admin/users/page.tsx` (select +
// "Salvar" por linha). Evita estado no client e mantém o botão honesto:
// "Salvar" salva o que está marcado NAQUEELA linha.
//
// ⚠️ SEM SPEC UNITÁRIO: `apps/web/vitest.config.ts` exclui `app/**/*.tsx` da
// cobertura, e um spec de render não atravessa o Server Action. A tela é
// coberta pelo Playwright da Fase 6 (`e2e/f14-admin-flags.spec.ts`), que
// carrega a página de verdade.
//
// ⚠️ E o `next build` NÃO é essa prova. MEDIDO 2026-10-18: com a diretiva
// `'use server'` ausente de `alternar`, o build passou (saída 0, rota
// `/admin/flags` listada) e o primeiro request respondia "Application error:
// a server-side exception has occurred" (digest 2923057904). A página é
// `force-dynamic`, então o build só a COMPILA — quem a executa é o request.

import type * as React from 'react';
import { revalidatePath } from 'next/cache';
import { obterMeuPerfilGlobal } from '../../../lib/perfil';
import { definirFeatureFlag, listarFeatureFlags } from '../../../lib/flags';

export const dynamic = 'force-dynamic';

export default async function AdminFeatureFlagsPage(): Promise<React.JSX.Element> {
  const me = await obterMeuPerfilGlobal();
  if (me === null || me.isAdmin !== true) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Acesso restrito</h1>
        <p className="mt-1 text-sm text-slate-500">Esta página exige perfil de administrador.</p>
      </main>
    );
  }

  const flags = await listarFeatureFlags();

  async function alternar(formData: FormData): Promise<void> {
    'use server';
    const chave = String(formData.get('chave') ?? '');
    // Checkbox desmarcado NÃO é enviado pelo browser: a ausência É o `false`.
    // É por isso que este form não precisa de campo oculto "estado atual" — o
    // valor enviado é sempre o estado final que o admin deixou na tela.
    const ativada = formData.get('ativada') === 'on';
    // ⚠️ SEM guarda de chave vazia, e é deliberado. Havia um
    // `if (chave !== '')` aqui: com `FormData` adulterado ele não gravava
    // nada, revalidava, e a tela mostrava exatamente o mesmo resultado de um
    // salvamento bom — sucesso aparente sobre nenhuma escrita. Sem a guarda o
    // erro SOBE (o `ApiError` da API não é engolido aqui), e o servidor é o
    // único portão: `isFeatureFlagKey` recusa com 400
    // `FEATURE_FLAG_CHAVE_INVALIDA`. `FormData` é entrada não confiável — o
    // browser envia o que o cliente mandar.
    await definirFeatureFlag(chave, ativada);
    revalidatePath('/admin/flags');
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Feature flags</h1>
      <p className="mt-1 text-sm text-slate-500">
        Desligar vale para o sistema inteiro — para todas as empresas, não só para a sua.
      </p>

      <table className="mt-6 w-full border-collapse text-sm">
        {/* `<caption>` e `scope` não são enfeite: sem eles a tabela só é
            legível por quem enxerga. Em modo de navegação por tabela, o leitor
            de tela associa célula a coluna pelo `scope`, e sem `caption` não há
            título que diga o que a tabela é. WCAG 1.3.1. */}
        <caption className="sr-only">Funcionalidades do sistema e o estado de cada uma</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th className="py-2 pr-4 font-medium text-slate-500" scope="col">
              Chave
            </th>
            <th className="py-2 pr-4 font-medium text-slate-500" scope="col">
              O que faz
            </th>
            <th className="py-2 font-medium text-slate-500" scope="col">
              Ativa
            </th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.chave} className="border-b border-slate-100">
              <td className="py-3 pr-4">
                <code>{f.chave}</code>
              </td>
              <td className="py-3 pr-4 text-slate-900">{f.descricao}</td>
              <td className="py-3">
                <form action={alternar} className="flex items-center gap-2">
                  <input type="hidden" name="chave" value={f.chave} />
                  <input
                    // O nome acessível carrega o ESTADO, não a ação. Era
                    // "Ativar <chave>" nos dois estados: descrevia o que o botão
                    // faria, e quem navega por leitor de tela não tinha como
                    // saber PELO NOME se a linha estava ligada — só inferindo do
                    // `checked`. (Revisão adversarial 2026-10-18, achado D.)
                    aria-label={`${f.chave} — ${f.ativada ? 'ligada' : 'desligada'}`}
                    className="size-4 rounded border-slate-300"
                    defaultChecked={f.ativada}
                    name="ativada"
                    type="checkbox"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  >
                    Salvar
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
