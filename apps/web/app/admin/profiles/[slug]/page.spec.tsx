// apps/web/app/admin/profiles/[slug]/page.spec.tsx
//
// O FURO que este spec fecha: `atualizarPerfil` (`lib/perfil.ts`) tinha spec
// unitário e ZERO callers de produção — o cliente estava pronto, testado, e
// nenhuma tela o usava. `name`/`description` apareciam como texto puro, e o
// `PATCH /admin/profiles/:id` nunca tinha um caminho verde na UI.
//
// Escopo: SÓ RENDER. A action é inline (como as outras 4 actions desta área),
// e uma action inline não é testável unitariamente — todas as actions com spec
// moram em `actions.ts`. A prova da gravação é o e2e, que lê o BANCO.
//
// ⚠️ Por que o gate `isSystem`/`isAdmin` é testado por AUSÊNCIA: `atualizar`
// recusa os dois (`profiles.use-cases.ts:268,271`) e o seed marca `admin` e
// `viewer` como `isSystem: true` — sem a condição, o clique leva 403
// garantido. Um formulário que aparece para todo mundo "funciona" e falha.
//
// ⚠️ Por que os dois casos negativos afirmam o `<h1>`: sem isso eles passam
// por vacuidade — a página renderizando NADA também não teria input, e o
// teste diria "o gate funciona" sobre uma página quebrada.

// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ProfileDetail } from '@projeto/shared-types';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../guard-admin', () => ({ exigirAdmin: vi.fn() }));
vi.mock('../../../../lib/perfil', () => ({
  obterPerfilPorSlug: vi.fn(),
  listarPermissoes: vi.fn(),
  trocarPermissoes: vi.fn(),
  atualizarPerfil: vi.fn(),
}));

import Page from './page';
import { exigirAdmin } from '../../guard-admin';
import { obterPerfilPorSlug, listarPermissoes } from '../../../../lib/perfil';

function perfil(over: Partial<ProfileDetail> = {}): ProfileDetail {
  return {
    id: 'e1f2a3b4-0000-4000-8000-000000000001',
    slug: 'editor',
    name: 'Editor',
    isAdmin: false,
    isSystem: false,
    description: 'Perfil de edição de conteúdo',
    permissionCount: 1,
    permissions: ['conteudo.editar'],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    version: 1,
    ...over,
  };
}

async function renderCom(p: ProfileDetail) {
  vi.mocked(exigirAdmin).mockResolvedValue({ bloqueio: false, me: {} } as never);
  vi.mocked(obterPerfilPorSlug).mockResolvedValue(p);
  vi.mocked(listarPermissoes).mockResolvedValue(['conteudo.editar']);
  const r = render(await Page({ params: Promise.resolve({ slug: p.slug }) }));
  return r.container;
}

// O projeto não usa `globals: true`: sem `cleanup`, o DOM acumulado faz o
// segundo teste achar o input do primeiro (mesmo problema do spec do login).
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('admin/profiles/[slug] — os metadados são editáveis', () => {
  it('perfil comum: nome e descrição viram inputs com o valor do perfil', async () => {
    const container = await renderCom(perfil());

    const nome = container.querySelector<HTMLInputElement>('input[name="name"]');
    const descricao = container.querySelector<HTMLInputElement>('input[name="description"]');

    expect(nome?.value).toBe('Editor');
    expect(descricao?.value).toBe('Perfil de edição de conteúdo');
  });

  it('perfil de SISTEMA: nenhum formulário de metadados — a API recusa o rename', async () => {
    const container = await renderCom(perfil({ isSystem: true }));

    expect(container.querySelector('input[name="name"]')).toBeNull();
    // anti-vacuidade: a página RENDERIZOU, e mesmo assim não há o formulário.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Perfil: Editor');
  });

  it('perfo ADMINISTRADOR: nenhum formulário de metadados — `isAdmin` também é travado', async () => {
    // `isSystem: false` de propósito: é o caso que o gate `isSystem` sozinho
    // deixaria vazar, e é o que o seed de `admin` produz num tenant.
    const container = await renderCom(perfil({ isAdmin: true, name: 'Administrador' }));

    expect(container.querySelector('input[name="name"]')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Perfil: Administrador');
  });
});
