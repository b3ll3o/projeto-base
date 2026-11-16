// apps/web/app/admin/profiles/page.tsx
//
// pt-BR (#93.1 — RBAC, 2026-10-16): lista de perfis (apenas admin).
// Server Component: chama `listarPerfis()`.
//
// pt-BR (#97): esta página checa `isAdmin` no front MESMO com a API como fonte
// da verdade — a checagem é duplicada de propósito. Ela é mais ESTRITA que a da
// API: um ator com `admin.manage-profiles` mas sem `isAdmin` passa pelo guard
// do backend e veria a tela; aqui ele vê "Acesso restrito". Aceitável nesta tela
// porque ela é a navegação de topo do admin — mostrar a lista de perfis para
// quem não tem o bypass de admin seria inconsistente com o resto da tela.

import type * as React from 'react';
import { Botao } from '@/components/ui/botao';
import { CabecalhoPagina } from '@/components/ui/cabecalho-pagina';
import { Container } from '@/components/ui/container';
import { CabecalhoTabela, CelulaTabela, Tabela } from '@/components/ui/tabela';
import { listarPerfis } from '../../../lib/perfil';
import { exigirAdmin } from '../guard-admin';
import { LinkTexto } from '@/components/ui/link-texto';

export const dynamic = 'force-dynamic';

export default async function AdminProfilesPage(): Promise<React.JSX.Element> {
  const guarda = await exigirAdmin();
  // `bloqueio: true` e `me` nunca coexistem: o discriminante faz o compilador
  // exigir este return, e foi o que impediu o formulário de vazar para quem não
  // é admin (MEDIDO nos e2e F10/F11/F12 — ver o cabeçalho de guard-admin.tsx).
  if (guarda.bloqueio) return guarda.tela;

  const profiles = await listarPerfis();

  return (
    <Container>
      <CabecalhoPagina titulo="Perfis de acesso" />

      <div className="mt-4">
        <Botao href="/admin/profiles/new">+ Novo perfil</Botao>
      </div>

      <Tabela legenda="Perfis cadastrados">
        <thead>
          <tr>
            <CabecalhoTabela>Slug</CabecalhoTabela>
            <CabecalhoTabela>Nome</CabecalhoTabela>
            <CabecalhoTabela>Admin?</CabecalhoTabela>
            <CabecalhoTabela>Sistema?</CabecalhoTabela>
            <CabecalhoTabela>Permissões</CabecalhoTabela>
            <CabecalhoTabela>
              <span className="sr-only">Ações</span>
            </CabecalhoTabela>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id}>
              <CelulaTabela>
                <code>{p.slug}</code>
              </CelulaTabela>
              <CelulaTabela>{p.name}</CelulaTabela>
              <CelulaTabela>{p.isAdmin ? 'Sim' : 'Não'}</CelulaTabela>
              <CelulaTabela>{p.isSystem ? 'Sim' : 'Não'}</CelulaTabela>
              <CelulaTabela className="tabular-nums">{p.permissionCount}</CelulaTabela>
              <CelulaTabela>
                <LinkTexto href={`/admin/profiles/${p.slug}`} aria-label={`Editar ${p.name}`}>
                  editar
                </LinkTexto>
              </CelulaTabela>
            </tr>
          ))}
        </tbody>
      </Tabela>
    </Container>
  );
}
