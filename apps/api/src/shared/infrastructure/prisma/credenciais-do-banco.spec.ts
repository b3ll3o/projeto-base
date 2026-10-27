// apps/api/src/shared/infrastructure/prisma/credenciais-do-banco.spec.ts
//
// pt-BR (#118): spec do guard que decide se as CREDENCIAIS do banco servem.
//
// O vetor que este guard fecha: `app_runtime_dev` (a senha do papel de
// runtime) está no HISTÓRICO do Git deste repositório. Quem leu o repositório
// conhece a senha — e ela era o default de qualquer banco novo, porque a
// migration a criava em texto puro.
//
// E o segundo: o `SYSTEM_DATABASE_URL` ausente. Sem ele, o bucket de sistema
// não abre (é a credencial que o concede, desde a migration
// `20261027000001_papel_de_sistema`) — e a API precisa dizer isso no BOOT, e
// não no primeiro cadastro.

import { describe, it, expect } from 'vitest';
import { verificarCredenciaisDoBanco } from './credenciais-do-banco.js';

const RUNTIME_BOM = 'postgresql://app_runtime:senha-de-teste-com-32-bytes-ok@postgres:5432/app';
const SISTEMA_BOM = 'postgresql://app_system:outra-senha-de-teste-com-32-bytes@postgres:5432/app';
const RUNTIME_EXPOSTO = 'postgresql://app_runtime:app_runtime_dev@postgres:5432/app';

describe('verificarCredenciaisDoBanco() (#118)', () => {
  // ── a senha exposta ──────────────────────────────────────────────────────
  it('RECUSA a senha exposta do papel de runtime', () => {
    const veredito = verificarCredenciaisDoBanco({
      NODE_ENV: 'production',
      DATABASE_URL: RUNTIME_EXPOSTO,
      SYSTEM_DATABASE_URL: SISTEMA_BOM,
    });
    expect(veredito.ok).toBe(false);
  });

  it('a mensagem da recusa NÃO embute a senha', () => {
    // A mensagem vai para o log de boot, e o log de boot acaba em
    // observabilidade com retenção.
    const veredito = verificarCredenciaisDoBanco({
      NODE_ENV: 'production',
      DATABASE_URL: RUNTIME_EXPOSTO,
      SYSTEM_DATABASE_URL: SISTEMA_BOM,
    });
    expect(veredito.ok).toBe(false);
    if (!veredito.ok) {
      expect(veredito.motivo).not.toContain('app_runtime_dev');
    }
  });

  it('RECUSA a senha exposta do papel de SISTEMA também', () => {
    const veredito = verificarCredenciaisDoBanco({
      NODE_ENV: 'production',
      DATABASE_URL: RUNTIME_BOM,
      SYSTEM_DATABASE_URL:
        'postgresql://app_system:CHANGE_ME_gerar_com_openssl_rand_base64_48@postgres:5432/app',
    });
    expect(veredito.ok).toBe(false);
  });

  it('RECUSA a senha exposta FORA de produção também', () => {
    // A senha exposta num banco de dev vaza para o de teste, e de lá para o
    // de staging. O guard não é só de produção.
    const veredito = verificarCredenciaisDoBanco({
      DATABASE_URL: RUNTIME_EXPOSTO,
      SYSTEM_DATABASE_URL: SISTEMA_BOM,
    });
    expect(veredito.ok).toBe(false);
  });

  // ── a credencial de sistema ──────────────────────────────────────────────
  it('RECUSA em produção quando falta o SYSTEM_DATABASE_URL', () => {
    const veredito = verificarCredenciaisDoBanco({
      NODE_ENV: 'production',
      DATABASE_URL: RUNTIME_BOM,
    });
    expect(veredito.ok).toBe(false);
    if (!veredito.ok) {
      expect(veredito.motivo).toContain('SYSTEM_DATABASE_URL');
    }
  });

  it('ACEITA fora de produção quando falta o SYSTEM_DATABASE_URL', () => {
    // O bucket de sistema não abre sem a credencial — mas o dev que não usa
    // onboarding cross-tenant não sente, e matar o boot de todo dev quebraria
    // o fluxo local.
    const veredito = verificarCredenciaisDoBanco({
      NODE_ENV: 'development',
      DATABASE_URL: RUNTIME_BOM,
    });
    expect(veredito.ok).toBe(true);
  });

  // ── o caminho feliz ──────────────────────────────────────────────────────
  it('ACEITA as duas credenciais em produção', () => {
    expect(
      verificarCredenciaisDoBanco({
        NODE_ENV: 'production',
        DATABASE_URL: RUNTIME_BOM,
        SYSTEM_DATABASE_URL: SISTEMA_BOM,
      }).ok,
    ).toBe(true);
  });

  it('ACEITA uma URI sem senha (o papel confia em peer/cert)', () => {
    // Sem senha não há senha exposta: e o banco que decide. A URI sem
    // credencial é válida em alguns deploys.
    expect(
      verificarCredenciaisDoBanco({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres@postgres:5432/app',
        SYSTEM_DATABASE_URL: 'postgresql://postgres@postgres:5432/app',
      }).ok,
    ).toBe(true);
  });

  it('uma URI que não parseia NÃO é tratada como senha exposta', () => {
    // Uma URI quebrada é problema de configuração, e a conexão vai recusar
    // com a mensagem dela — que é mais honesta que "senha exposta".
    expect(
      verificarCredenciaisDoBanco({
        NODE_ENV: 'production',
        DATABASE_URL: 'nao-e-uma-uri',
        SYSTEM_DATABASE_URL: SISTEMA_BOM,
      }).ok,
    ).toBe(true);
  });

  it('a senha percent-encoded é lida depois do decode', () => {
    // `app_runtime_dev` não tem caractere especial, mas uma senha com `@` ou
    // `:` na URI vem percent-encoded — e é o valor DECODED que a comparação
    // tem de ver.
    const veredito = verificarCredenciaisDoBanco({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://app_runtime:app%5Fruntime%5Fdev@postgres:5432/app',
      SYSTEM_DATABASE_URL: SISTEMA_BOM,
    });
    expect(veredito.ok).toBe(false);
  });
});
