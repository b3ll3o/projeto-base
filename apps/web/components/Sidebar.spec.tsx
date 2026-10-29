// apps/web/components/Sidebar.spec.tsx
//
// pt-BR (#97): o defeito que este spec cobre era um `undefined` silencioso.
//
// O Sidebar lia `me.profile?.name` e `me.profile?.isAdmin`, mas a API nunca
// devolveu um objeto `profile` — devolve `profileId`/`profileSlug`/
// `profileName`. O `?.` transformava o erro de contrato em `undefined`, e o
// optional chaining sumia com ele: o rodapé mostrava "Sem perfil" para
// qualquer usuário COM perfil, e o guard `me?.isAdmin === true` simplesmente
// não entrava. Nenhum teste ficava vermelho, porque o componente "funcionava".
//
// O teste monta o payload EXATO que `me-profile.controller.ts` devolve e
// afirma contra os campos reais. É por isso que ele é vermelho contra o
// código antigo: `me.profile` não existe no payload, então
// `me.profile?.name ?? 'Sem perfil'` renderiza "Sem perfil" mesmo com
// `profileName: 'Editor'`.
//
// `next/link` é mockado para um `<a>`: o que está sob teste é a DECISÃO do
// Sidebar, não o roteamento do Next.

// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MeProfileDto } from '@projeto/shared-types';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const obterMeuPerfilMock = vi.hoisted(() => vi.fn());
// ⚠️ 2026-10-29 (revisão do PR #127): o Sidebar lê DOIS perfis — o EFETIVO
// (da empresa da sessão, que abre "Perfis"/"Atribuir perfis") e o GLOBAL (do
// bucket de SISTEMA, que abre "Feature flags"/"Empresas e usuários"). São
// pessoas diferentes: o DONO de uma empresa tem `isAdmin: true` no efetivo
// e NÃO no global. Sem o segundo dublê no mock, o `Sidebar.tsx` morre em
// "No obterMeuPerfilGlobal export is defined on the mock" — o spec some,
// e o sintoma não é o do defeito.
const obterMeuPerfilGlobalMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/perfil', () => ({
  obterMeuPerfil: obterMeuPerfilMock,
  obterMeuPerfilGlobal: obterMeuPerfilGlobalMock,
}));

const { Sidebar } = await import('./Sidebar');

/** Payload literal de `GET /api/v1/me/profile` — nenhum campo a mais. */
const ME_COM_PERFIL: MeProfileDto = {
  profileId: '3f6a2b1c-0000-4000-8000-000000000001',
  profileSlug: 'editor',
  profileName: 'Editor',
  isAdmin: true,
  permissions: ['admin.manage-profiles'],
};

beforeEach(() => {
  obterMeuPerfilMock.mockReset();
  obterMeuPerfilGlobalMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('Sidebar — lê os campos que a API devolve', () => {
  it('mostra o nome do perfil vindo de profileName, não de um objeto profile', async () => {
    obterMeuPerfilMock.mockResolvedValue(ME_COM_PERFIL);
    render(await Sidebar());
    expect(screen.getByText(/Editor/)).toBeInTheDocument();
    expect(screen.queryByText('Sem perfil')).not.toBeInTheDocument();
  });

  it('isAdmin vem do topo do payload — o link Admin aparece para admin', async () => {
    obterMeuPerfilMock.mockResolvedValue(ME_COM_PERFIL);
    render(await Sidebar());
    expect(screen.getByRole('link', { name: 'Perfis' })).toBeInTheDocument();
  });

  it('usuário comum não vê o link Admin', async () => {
    obterMeuPerfilMock.mockResolvedValue({ ...ME_COM_PERFIL, isAdmin: false });
    render(await Sidebar());
    expect(screen.queryByRole('link', { name: 'Perfis' })).not.toBeInTheDocument();
  });

  // pt-BR (feature-flags, 2026-10-18 — Fase 5): o negativo é OBRIGATÓRIO aqui, e
  // não por simetria com o caso do "Perfis". Um link de admin que aparece para
  // usuário comum não quebra nada — ele leva a uma tela que responde "Acesso
  // restrito". O único sintoma seria um teste verde com uma tela inacessível no
  // menu, então é o `href` que se afirma, não só o nome.
  //
  // ⚠️ 2026-10-29: o link das feature flags é do bloco de SISTEMA, e quem o
  // abre é o `isAdmin` do bucket GLOBAL — não o efetivo. É o global que se
  // mocka aqui.
  it('admin do SISTEMA vê o link das feature flags apontando para /admin/flags', async () => {
    obterMeuPerfilMock.mockResolvedValue(ME_COM_PERFIL);
    obterMeuPerfilGlobalMock.mockResolvedValue(ME_COM_PERFIL);
    render(await Sidebar());
    expect(screen.getByRole('link', { name: 'Feature flags' })).toHaveAttribute(
      'href',
      '/admin/flags',
    );
  });

  it('usuário comum NÃO vê o link das feature flags', async () => {
    obterMeuPerfilMock.mockResolvedValue({ ...ME_COM_PERFIL, isAdmin: false });
    obterMeuPerfilGlobalMock.mockResolvedValue({ ...ME_COM_PERFIL, isAdmin: false });
    render(await Sidebar());
    expect(screen.queryByRole('link', { name: 'Feature flags' })).not.toBeInTheDocument();
  });

  // ⚠️ 2026-10-29 (revisão do PR #127): os DOIS `isAdmin` são de PESSOAS
  // diferentes, e esta é a distinção que a revisão do menu corrigiu. O DONO de
  // uma empresa tem `isAdmin: true` no perfil EFETIVO (medido: toda empresa
  // nova nasce com o dono como admin) — e as telas de SISTEMA exigem o
  // `isAdmin` do bucket GLOBAL. Sem esta distinção, o menu oferecia um link
  // que levava a "Acesso restrito".
  it('o link de SISTEMA segue o perfil GLOBAL — o dono da empresa (admin efetivo) não o vê', async () => {
    obterMeuPerfilMock.mockResolvedValue(ME_COM_PERFIL);
    obterMeuPerfilGlobalMock.mockResolvedValue({ ...ME_COM_PERFIL, isAdmin: false });

    render(await Sidebar());

    expect(screen.queryByRole('link', { name: 'Feature flags' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Empresas e usuários' })).not.toBeInTheDocument();
    // E o de EMPRESA continua — o dono administra a empresa DELE.
    expect(screen.getByRole('link', { name: 'Perfis' })).toBeInTheDocument();
  });

  it('o administrador do SISTEMA vê os links de SISTEMA sem ser admin de empresa', async () => {
    obterMeuPerfilMock.mockResolvedValue({ ...ME_COM_PERFIL, isAdmin: false });
    obterMeuPerfilGlobalMock.mockResolvedValue(ME_COM_PERFIL);

    render(await Sidebar());

    expect(screen.getByRole('link', { name: 'Feature flags' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Empresas e usuários' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Perfis' })).not.toBeInTheDocument();
  });

  it('perfil nulo é o único caso que mostra "Sem perfil"', async () => {
    obterMeuPerfilMock.mockResolvedValue({
      profileId: null,
      profileSlug: null,
      profileName: null,
      isAdmin: false,
      permissions: [],
    });
    render(await Sidebar());
    expect(screen.getByText(/Sem perfil/)).toBeInTheDocument();
  });
});
