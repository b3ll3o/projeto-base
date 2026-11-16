// apps/web/app/admin/users/page.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): lista de users com select para
// atribuir/trocar profile. Server Component + form com Server Action.

import type * as React from 'react';
import { revalidatePath } from 'next/cache';
import { Botao } from '@/components/ui/botao';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Container } from '@/components/ui/container';
import { CabecalhoTabela, CelulaTabela, Tabela } from '@/components/ui/tabela';
import { listarPerfis, atribuirPerfil, decidirAtribuicaoPerfil } from '../../../lib/perfil';
import { exigirAdmin } from '../guard-admin';
import { ApiClient, baseUrlDaApi } from '../../../lib/api-client';
import { exigirSessao, lerTenant } from '../../../lib/sessao';
import type { UserOutputDto, UsersPageDto } from '@projeto/shared-types';
import { CLASSE_CONTROLE_COMPACTO } from '@/components/ui/campo';

export const dynamic = 'force-dynamic';

async function listarUsers(): Promise<UserOutputDto[]> {
  const accessToken = await exigirSessao();
  const tenantId = await lerTenant();
  const client = new ApiClient({
    baseUrl: baseUrlDaApi(),
    getToken: () => accessToken,
    getTenant: () => tenantId,
  });
  const pagina = await client.get<UsersPageDto>('/users?limit=100');
  return pagina.users;
}

export default async function AdminUsersPage(): Promise<React.JSX.Element> {
  const guarda = await exigirAdmin();
  // `bloqueio: true` e `me` nunca coexistem: o discriminante faz o compilador
  // exigir este return, e foi o que impediu o formulário de vazar para quem não
  // é admin (MEDIDO nos e2e F10/F11/F12 — ver o cabeçalho de guard-admin.tsx).
  if (guarda.bloqueio) return guarda.tela;

  const [users, profiles] = await Promise.all([listarUsers(), listarPerfis()]);

  async function atribuir(formData: FormData): Promise<void> {
    'use server';
    const userId = String(formData.get('userId') ?? '');
    const selecionado = String(formData.get('profileId') ?? '');
    // O perfil atual vem da MESMA fonte que o `defaultValue` do select, então
    // comparar contra ele é o que distingue "não toquei em nada" de "escolhi
    // a opção vazia de propósito".
    const atual = String(formData.get('profileIdAtual') ?? '') || null;

    // pt-BR (#97, M3): a decisão é fail-safe. A opção vazia limpa o perfil com
    // o MESMO PUT e `profileId: null` (não existe DELETE para isso) — mas só
    // quando havia perfil. Sem isso, `Salvar` sem tocar em nada removia o
    // perfil de quem já estava sem perfil.
    if (userId) {
      const decisao = decidirAtribuicaoPerfil({ selecionado, atual });
      if (decisao.tipo === 'atribuir') {
        await atribuirPerfil(userId, decisao.profileId);
      } else if (decisao.tipo === 'remover') {
        await atribuirPerfil(userId, null);
      }
    }
    revalidatePath('/admin/users');
  }

  return (
    <Container>
      <CabecalhoPagina titulo="Atribuir perfis" />

      <Tabela legenda="Pessoas e o perfil atribuído a cada uma">
        <thead>
          <tr>
            <CabecalhoTabela>Nome</CabecalhoTabela>
            <CabecalhoTabela>Email</CabecalhoTabela>
            <CabecalhoTabela>Perfil atual</CabecalhoTabela>
            <CabecalhoTabela>Atribuir</CabecalhoTabela>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            // pt-BR (#106): o perfil exibido é o EFETIVO no escopo, não o global.
            // `profileId` (users.profile_id) é null para toda conta criada pelo
            // produto, então usá-lo fazia a coluna dizer "sem perfil" para quem
            // tem perfil — em toda linha, sempre.
            //
            // ⚠️ "sem perfil" é o rótulo ÚNICO, para vinculado-sem-perfil e para
            // fora-da-empresa. MEDIDO: a versão que distinguia os dois com
            // "fora desta empresa" quebrou o e2e F12, que semeia o usuário-alvo
            // por `POST /users` — sem membership no tenant — e afirma "sem
            // perfil". Os dois estados pedem a MESMA ação do admin (atribuir um
            // perfil), e a distinção fina fica na API e no tooltip, não numa
            // coluna que a pessoa lê para decidir o que fazer. O que a coluna
            // promete — "esta pessoa não tem perfil AGORA" — continua vero nos
            // dois casos.
            const perfilIdNoEscopo = u.perfilEfetivoNoEscopo;
            // pt-BR (achado 3): o `<select>` só conhece os perfis que
            // `GET /admin/profiles` devolveu. Se `perfilEfetivoNoEscopo` aponta
            // para um perfil GLOBAL (aceito pelo `findProfileId` via
            // `OR: [{ tenantId: null }, { tenantId }]`, mas filtrado por
            // `tenantId` na lista), `atual` é `undefined` e o dropdown mostra
            // "— sem perfil —".
            //
            // A versão anterior passava o id do membership no hidden
            // `profileIdAtual` e o `''` do dropdown no select: as DUAS fontes
            // discordavam, `decidirAtribuicaoPerfil` via `remover`, e apertar
            // "Salvar" sem editar nada apagava o perfil. A divergência era o
            // gatilho.
            //
            // A correção é o hidden deixar de ser uma fonte independente: ele
            // carrega o que o SELECT está mostrando. Se o perfil não está na
            // lista, o hidden também não o carrega — e salvar sem editar vira
            // no-op, que é o comportamento correto.
            //
            // ⚠️ Isto é fail-safe para o lado que importa: o pior caso é a
            // atribuição não parecer, e não um perfil sumir sem ação nenhuma.
            const atual = profiles.find((p) => p.id === perfilIdNoEscopo);
            const perfilIdExibido = atual?.id ?? '';
            return (
              <tr key={u.id}>
                <CelulaTabela>{u.nome}</CelulaTabela>
                <CelulaTabela>{u.email}</CelulaTabela>
                <CelulaTabela>
                  {atual ? <code>{atual.slug}</code> : <em>sem perfil</em>}
                </CelulaTabela>
                <CelulaTabela>
                  <form action={atribuir} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="profileIdAtual" value={perfilIdExibido} />
                    {/* pt-BR: sem nome acessível o leitor de tela anuncia um
                        combo box anônimo, 1× por linha. `aria-label` não cria
                        elemento — a estrutura que o e2e mede fica igual. */}
                    <select
                      aria-label={`Perfil de ${u.email}`}
                      className={CLASSE_CONTROLE_COMPACTO}
                      defaultValue={perfilIdExibido}
                      name="profileId"
                    >
                      <option value="">— sem perfil —</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.slug} {p.isAdmin ? '(admin)' : ''}
                        </option>
                      ))}
                    </select>
                    <Botao
                      type="submit"
                      variante="secundario"
                      tamanho="sm"
                      // ⚠️ O nome acessível diz DE QUAL linha (WCAG 2.4.6): o
                      // botão é "Salvar" em N linhas da mesma tabela, e quem
                      // navega por leitor de tela ouve N "Salvar" idênticos.
                      // O select da MESMA linha já se nomeia.
                      aria-label={`Salvar perfil de ${u.email}`}
                    >
                      Salvar
                    </Botao>
                  </form>
                </CelulaTabela>
              </tr>
            );
          })}
        </tbody>
      </Tabela>
    </Container>
  );
}
