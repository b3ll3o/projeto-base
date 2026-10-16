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
vi.mock('../lib/perfil', () => ({ obterMeuPerfil: obterMeuPerfilMock }));

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
