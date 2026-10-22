// apps/web/app/empresa/nova/page.spec.tsx
//
// Teste da página de criação de empresa.
//
// pt-BR (onboarding de empresa, 2026-10-22): a página tem UMA decisão, e ela
// é a que a página existe para fazer — EXIGIR SESSÃO.
//
// ⚠️ Por que isso é um teste e não uma formalidade: esta tela é a que a
// pessoa cai quando o login descobre que ela não tem empresa nenhuma. Sem
// sessão, `POST /tenants` responderia 401 — e a pessoa veria um formulário que
// aceita, valida e recusa no fim, sem dizer por quê. A página que evita isso
// é a que chama `exigirSessao()` ANTES de renderizar.
//
// ⚠️ O `EmpresaForm` é MOCKADO, e o motivo é o escopo: o formulário tem spec
// próprio (`components/empresa-form.spec.tsx`), e o que está sob teste aqui é
// a LIGAÇÃO da página — que a Action entregue é a de criar a empresa. Se o
// teste renderizasse o formulário de verdade, ele mediria o formulário e a
// página passaria verde com a Action errada.
//
// ⚠️ `next/navigation` é mockado pelo mesmo motivo do spec do login: o
// `redirect` real lança `NEXT_REDIRECT`, e aqui nada navega de verdade.

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { exigirSessao } from '@/lib/sessao';

// `vi.hoisted` porque os factories de `vi.mock` são içados para ANTES dos
// imports — e o import da página (que dispara o factory) acontece antes de
// qualquer `const` do módulo ordinary estar inicializado.
const { actionSpy, recebido } = vi.hoisted(() => ({
  actionSpy: vi.fn(async () => undefined),
  recebido: { action: undefined as unknown },
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/sessao', () => ({
  exigirSessao: vi.fn(async () => 'token-ator'),
}));

vi.mock('./actions', () => ({
  criarEmpresaDoAtor: actionSpy,
}));

vi.mock('@/components/empresa-form', () => ({
  EmpresaForm: ({ action }: { action: unknown }) => {
    recebido.action = action;
    return <div data-testid="form-empresa" />;
  },
}));

import PaginaNovaEmpresa from './page';

beforeEach(() => {
  vi.clearAllMocks();
  recebido.action = undefined;
});

afterEach(() => {
  cleanup();
});

describe('PaginaNovaEmpresa — a tela que cria a empresa', () => {
  it('EXIGE sessão antes de entregar o formulário', async () => {
    render(await PaginaNovaEmpresa());

    // A afirmação que tem dente: sem esta chamada, a pessoa sem sessão
    // receberia um formulário que aceita e só recusa no fim (401 do
    // `POST /tenants`), sem uma palavra sobre por quê.
    expect(vi.mocked(exigirSessao)).toHaveBeenCalled();
  });

  it('entrega o formulário ligado à Action de criar a empresa', async () => {
    render(await PaginaNovaEmpresa());

    expect(screen.getByTestId('form-empresa')).toBeInTheDocument();
    // A ligação, e não a Action: o que a página entrega é a Action que o
    // formulário vai chamar ao submeter.
    expect(recebido.action).toBe(actionSpy);
  });
});
