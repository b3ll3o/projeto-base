// apps/api/src/shared/infrastructure/prisma/credenciais-do-banco.spec.ts
//
// pt-BR (#118): spec do guard que decide se as CREDENCIAIS do banco servem.
//
// O vetor que este guard fecha (#133): a senha do papel de runtime que o
// repositório PUBLICAOU está no HISTÓRICO do Git — e quem leu o repositório,
// conhece. A recusa não pode ser por VALOR (escrever o valor aqui seria
// outra forma de publicá-lo), e é por CRITÉRIO: o prefixo de exemplo e o
// TAMANHO mínimo. A senha publicada tinha 15 caracteres — abaixo do mínimo.
//
// E o segundo: o `SYSTEM_DATABASE_URL` ausente. Sem ele, o bucket de sistema
// não abre (é a credencial que o concede, desde a migration
// `20261027000001_papel_de_sistema`) — e a API precisa dizer isso no BOOT, e
// não no primeiro cadastro.
//

import { describe, it, expect } from 'vitest';
import { verificarCredenciaisDoBanco } from './credenciais-do-banco.js';

const RUNTIME_BOM = 'postgresql://app_runtime:senha-de-teste-com-32-bytes-ok@postgres:5432/app';
const SISTEMA_BOM = 'postgresql://app_system:outra-senha-de-teste-com-32-bytes@postgres:5432/app';
// ⚠️ (#133) O valor de teste NÃO é a senha que o repositório publicou — é um
// valor SINTÉTICO, com o mesmo defeito que ela tinha: é curto demais para um
// papel gerenciado. É o que o guard tem de recusar agora.
const SENHA_CURTA_DE_PAPEL = 'curta-demais';
const RUNTIME_EXPOSTO = `postgresql://app_runtime:${SENHA_CURTA_DE_PAPEL}@postgres:5432/app`;

describe('verificarCredenciaisDoBanco() (#118)', () => {
  // ── a senha exposta ──────────────────────────────────────────────────────
  it('RECUSA a senha CURTA do papel de runtime (#133)', () => {
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
      expect(veredito.motivo).not.toContain(SENHA_CURTA_DE_PAPEL);
    }
  });

  it('RECUSA a senha CURTA do papel de SISTEMA também', () => {
    const veredito = verificarCredenciaisDoBanco({
      NODE_ENV: 'production',
      DATABASE_URL: RUNTIME_BOM,
      SYSTEM_DATABASE_URL:
        'postgresql://app_system:CHANGE_ME_gerar_com_openssl_rand_base64_48@postgres:5432/app',
    });
    expect(veredito.ok).toBe(false);
  });

  it('RECUSA a senha CURTA FORA de produção também', () => {
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

  it('RECUSA fora de `development` quando falta o SYSTEM_DATABASE_URL — default-deny', () => {
    // ⚠️ O caso que a polaridade antiga (`=== 'production'`) deixava passar:
    // `staging`, `prod`, `Prod` e `NODE_ENV` ausente. A API SOBIA, e o
    // primeiro login estourava — `clienteDeSistema()` LANÇA, e o `Error` cru
    // vira 500 no cadastro.
    //
    // `development` é o único ambiente com direito ao atalho — a MESMA
    // polaridade do `decisaoDoAdminLocal` (PR #115).
    for (const nodeEnv of ['staging', 'prod', 'Prod', 'PRODUCTION', undefined]) {
      const veredito = verificarCredenciaisDoBanco({
        NODE_ENV: nodeEnv,
        DATABASE_URL: RUNTIME_BOM,
      });
      expect(veredito.ok, `NODE_ENV=${String(nodeEnv)}`).toBe(false);
    }
  });

  it('RECUSA o placeholder `***` — a isca do example não pode passar', () => {
    // ⚠️ O `.env.production.example` trouxeram `***` nas DUAS credenciais dos
    // papeis, e `***` não é a senha publicada nem começa com `change_me`:
    // o guard ACEITAVA, o boot passava, e o `prepara-papeis.sh` aplicava `***`
    // como a senha VIVA do papel de produção.
    for (const uri of [
      'postgresql://app_runtime:***@postgres:5432/app',
      'postgresql://app_system:***@postgres:5432/app',
    ]) {
      const veredito = verificarCredenciaisDoBanco({
        NODE_ENV: 'production',
        DATABASE_URL: uri,
        SYSTEM_DATABASE_URL: uri,
      });
      expect(veredito.ok, uri).toBe(false);
    }
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

  it('o DONO do banco passa — o mínimo é dos PAPÉIS, e o dev conecta como o dono (#133)', () => {
    // MEDIDO: o `docker-compose.dev.yml` conecta como `projeto:projeto` (6
    // caracteres) e o guard roda no boot de TODO `NODE_ENV`. Um mínimo de
    // tamanho sem esta exceção derrubaria o ambiente de desenvolvimento no
    // primeiro boot — e o sintoma seria "a API não sobe", sem dizer por quê.
    const veredito = verificarCredenciaisDoBanco({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://projeto:projeto@postgres:5432/projeto_base?schema=public',
      SYSTEM_DATABASE_URL: 'postgresql://projeto:projeto@postgres:5432/projeto_base?schema=public',
    });
    expect(veredito.ok).toBe(true);
  });

  it('o valor de EXEMPLO do dono também passa — o dono não tem mínimo (#133)', () => {
    // O dono é Superuser (ou tem CREATEROLE): a credencial dele é a
    // `DIRECT_DATABASE_URL`, que o guard de boot NÃO recebe. A regra do dono
    // é do `prepara-papeis.sh`, que a aplica antes de escrever a senha dos
    // papeis.
    const veredito = verificarCredenciaisDoBanco({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://projeto:projeto@postgres:5432/projeto_base?schema=public',
    });
    expect(veredito.ok).toBe(true);
  });

  it('a senha percent-encoded é lida depois do decode', () => {
    // A senha tem caractere especial (`_` virando `%5F`), e uma senha com `@`
    // ou `:` na URI vem percent-encoded — é o valor DECODED que a comparação
    // tem de ver.
    const veredito = verificarCredenciaisDoBanco({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://app_runtime:curta%5Fdemais@postgres:5432/app',
      SYSTEM_DATABASE_URL: SISTEMA_BOM,
    });
    expect(veredito.ok).toBe(false);
  });
});
