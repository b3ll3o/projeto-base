// apps/api/src/shared/auth/segredo-de-servico.spec.ts
//
// pt-BR (#120): spec do guard que decide se um segredo de serviço serve.
//
// O vetor que este guard fecha: o `.env.production.example` publica
// `JWT_SECRET=CHANGE_ME_gerar_com_openssl_rand_base64_48` como exemplo, e a
// validação antiga ("só não pode estar vazia") aceitava esse valor. Um
// operador que copiasse a linha do example para o `.env.production` teria um
// segredo JWT público no repositório — e quem o conhece forja access token
// para qualquer `sub`.
//
// A lista de placeholders é estreita DE PROPÓSITO: um `startsWith('secret')`
// recusaria o segredo legítimo `secreto-da-empresa-2026`. O caso está na spec
// como "NÃO recusa", para que ninguém "engorde" a lista depois.

import { describe, it, expect } from 'vitest';
import {
  segredoDeServico,
  TAMANHO_MINIMO_SEGREDO,
  PREFIXOS_DE_PLACEHOLDER,
} from './segredo-de-servico.js';

/** Um segredo válido: longo o bastante e sem cara de exemplo. */
const SEGREDO_BOM = 'segredo-de-teste-com-tamanho-razoavel-0001';

describe('segredoDeServico()', () => {
  // ── o caminho feliz ──────────────────────────────────────────────────────
  it('ACEITA um segredo com tamanho suficiente', () => {
    const veredito = segredoDeServico(SEGREDO_BOM, 'JWT_SECRET');
    expect(veredito).toEqual({ ok: true, valor: SEGREDO_BOM });
  });

  it('ACITA um segredo com espaços nas pontas e devolve aparado', () => {
    const veredito = segredoDeServico(`  ${SEGREDO_BOM}  `, 'JWT_SECRET');
    expect(veredito).toEqual({ ok: true, valor: SEGREDO_BOM });
  });

  // ── ausência ─────────────────────────────────────────────────────────────
  it('RECUSA ausente', () => {
    const veredito = segredoDeServico(undefined, 'JWT_SECRET');
    expect(veredito.ok).toBe(false);
  });

  it('RECUSA vazio', () => {
    expect(segredoDeServico('', 'JWT_SECRET').ok).toBe(false);
  });

  it('RECUSA só espaços (o `JWT_SECRET=` esquecido na linha do .env)', () => {
    expect(segredoDeServico('   ', 'JWT_SECRET').ok).toBe(false);
  });

  // ── placeholder ───────────────────────────────────────────────────────────
  it('RECUSA o placeholder do .env.production.example', () => {
    // MEDIDO no example: `CHANGE_ME_gerar_com_openssl_rand_base64_48`.
    // Este é O valor que a validação antiga aceitava.
    const veredito = segredoDeServico('CHANGE_ME_gerar_com_openssl_rand_base64_48', 'JWT_SECRET');
    expect(veredito.ok).toBe(false);
  });

  it('RECUSA placeholder em minúsculas (a comparação não depende de caixa)', () => {
    expect(segredoDeServico('change_me_gerar_com_openssl_rand_base64_48', 'JWT_SECRET').ok).toBe(
      false,
    );
  });

  it('RECUSA o placeholder do Grafana', () => {
    expect(
      segredoDeServico('CHANGE_ME_gerar_com_openssl_rand_base64_18', 'GF_SECURITY_ADMIN_PASSWORD')
        .ok,
    ).toBe(false);
  });

  it('RECUSA `changeme` e `trocar-esta-senha`', () => {
    expect(segredoDeServico('changeme', 'JWT_SECRET').ok).toBe(false);
    expect(segredoDeServico('trocar-esta-senha', 'JWT_SECRET').ok).toBe(false);
  });

  // ── a lista NÃO pode ser "engordada" ──────────────────────────────────────
  it('NÃO recusa um segredo legítimo que começa com "secret" (o "segredo")', () => {
    // Este é o caso que impede `startsWith('secret')` na lista. Um prefixo
    // amplo aqui derrubaria o boot de um serviço com senha real.
    const legitimo = 'secreto-da-empresa-2026-com-tamanho-ok';
    expect(legitimo.length).toBeGreaterThanOrEqual(TAMANHO_MINIMO_SEGREDO);
    expect(segredoDeServico(legitimo, 'JWT_SECRET').ok).toBe(true);
  });

  it('NÃO recusa um segredo que só CONTER "changeme" no meio', () => {
    const legitimo = 'minha-senha-changeme-2026-com-32-bytes-ok';
    expect(segredoDeServico(legitimo, 'JWT_SECRET').ok).toBe(true);
  });

  // ── entropia ──────────────────────────────────────────────────────────────
  it('RECUSA um segredo curto demais', () => {
    const veredito = segredoDeServico('curto', 'JWT_SECRET');
    expect(veredito.ok).toBe(false);
  });

  it('RECUSA exatamente 1 byte abaixo do mínimo', () => {
    const limite = 'a'.repeat(TAMANHO_MINIMO_SEGREDO - 1);
    expect(segredoDeServico(limite, 'JWT_SECRET').ok).toBe(false);
  });

  it('ACEITA exatamente o mínimo', () => {
    const limite = 'a'.repeat(TAMANHO_MINIMO_SEGREDO);
    expect(segredoDeServico(limite, 'JWT_SECRET').ok).toBe(true);
  });

  // ── a mensagem ────────────────────────────────────────────────────────────
  it('NÃO embute o valor na mensagem de recusa', () => {
    // A mensagem vai para o log de boot, e o log de boot acaba em
    // observabilidade com retenção. Um segredo de verdade na mensagem é um
    // segredo novo no histórico.
    const segredo = 'valor-que-nao-pode-vazar-nas-mensagens-0001';
    const veredito = segredoDeServico(segredo.slice(0, 10), 'JWT_SECRET');
    expect(veredito.ok).toBe(false);
    if (!veredito.ok) {
      expect(veredito.motivo).not.toContain(segredo);
      expect(veredito.motivo).not.toContain(segredo.slice(0, 10));
    }
  });

  it('a mensagem de recusa nomeia a VARIÁVEL, não o valor', () => {
    const veredito = segredoDeServico('curto', 'GF_SECURITY_ADMIN_PASSWORD');
    expect(veredito.ok).toBe(false);
    if (!veredito.ok) {
      expect(veredito.motivo).toContain('GF_SECURITY_ADMIN_PASSWORD');
    }
  });

  // ── a lista é exportada, e a spec a prende ───────────────────────────────
  it('a lista de prefixos de placeholder está exportada e não é vazia', () => {
    // MEDIDO no PR #115 (achado 1): a lista de hosts do admin local é
    // EXPORTADA de propósito — sem isso, um hostname acrescentado por engano
    // entra na lista e nenhum teste cai. A mesma razão aqui.
    expect(PREFIXOS_DE_PLACEHOLDER.length).toBeGreaterThan(0);
    expect(PREFIXOS_DE_PLACEHOLDER).toContain('change_me');
  });
});
