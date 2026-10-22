// .tooling/scripts/ci/boot-local.spec.ts
//
// A etapa "sobe a aplicação localmente" do `ci:local` — o que ela mede.
//
// MEDIDO 2026-10-21: o `ci:local` rodava lint, tipos, unit, cobertura,
// integração, e2e e o tooling — e NADA subia a aplicação. A suíte e2e sobe a
// API em `tsx` e o web no BUILD de produção; o `pnpm dev` — o jeito que quem
// desenvolve roda a aplicação — não era medido por nada.
//
// O que esta spec mede: as DUAS decisões que a etapa toma (o que o `.env`
// local diz, e o que cada resposta de saúde significa) e a FIAÇÃO da etapa no
// `ci:local`.
//
// O que esta spec NÃO mede: que a aplicação sobe. Isso é execução — a etapa
// roda no `ci:local`, contra o banco local de `apps/api/.env`, e o veredito é
// do processo que sobe e derruba a aplicação.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avaliarSaudeApi, avaliarSaudeWeb, lerEnvDotEnv, mensagemDeFalha } from './boot-local';

const RAIZ = fileURLToPath(new URL('../../..', import.meta.url));

/** O `package.json` raiz — de onde sai a fiação da etapa. */
function packageRaiz(): { scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
}

describe('lerEnvDotEnv', () => {
  it('lê chave e valor', () => {
    expect(lerEnvDotEnv('DATABASE_URL=postgresql://x@localhost:5432/db')).toEqual({
      DATABASE_URL: 'postgresql://x@localhost:5432/db',
    });
  });

  it('ignora comentário e linha em branco', () => {
    const conteudo = ['# um comentário', '', '   ', 'JWT_SECRET=abc'].join('\n');
    expect(lerEnvDotEnv(conteudo)).toEqual({ JWT_SECRET: 'abc' });
  });

  it('tira as aspas do valor', () => {
    expect(lerEnvDotEnv('JWT_SECRET="a b"')).toEqual({ JWT_SECRET: 'a b' });
    expect(lerEnvDotEnv("JWT_SECRET='a b'")).toEqual({ JWT_SECRET: 'a b' });
  });

  it('divide no PRIMEIRO "=" — o valor pode conter "="', () => {
    expect(lerEnvDotEnv('TOKEN=a=b=c')).toEqual({ TOKEN: 'a=b=c' });
  });

  it('um "#" no meio do valor não abre comentário', () => {
    expect(lerEnvDotEnv('SENHA=a#b')).toEqual({ SENHA: 'a#b' });
  });
});

describe('avaliarSaudeApi', () => {
  const corpoSaudavel = { status: 'ok', checks: { database: 'ok' } };

  it('aceita 200 com o banco "ok"', () => {
    expect(avaliarSaudeApi(200, corpoSaudavel).ok).toBe(true);
  });

  it('recusa 503 — o banco local não respondeu', () => {
    const d = avaliarSaudeApi(503, { status: 'degraded', checks: { database: 'down' } });
    expect(d.ok).toBe(false);
    expect(d.erro).toContain('banco');
  });

  it('recusa 200 com o banco fora de "ok" — o healthcheck mente se só o status for olhado', () => {
    const d = avaliarSaudeApi(200, { status: 'ok', checks: { database: 'down' } });
    expect(d.ok).toBe(false);
    expect(d.erro).toContain('banco');
  });

  it('recusa um status que não é 200 nem 503', () => {
    const d = avaliarSaudeApi(500, {});
    expect(d.ok).toBe(false);
    expect(d.erro).toContain('500');
  });
});

describe('avaliarSaudeWeb', () => {
  it('aceita 200 com status "ok"', () => {
    expect(avaliarSaudeWeb(200, { status: 'ok' }).ok).toBe(true);
  });

  it('recusa 200 com outro status', () => {
    const d = avaliarSaudeWeb(200, { status: 'degraded' });
    expect(d.ok).toBe(false);
  });

  it('recusa um status que não é 200', () => {
    const d = avaliarSaudeWeb(404, {});
    expect(d.ok).toBe(false);
    expect(d.erro).toContain('404');
  });
});

describe('mensagemDeFalha', () => {
  it('diz que MORREU quando o processo morreu — "não respondeu" seria mentira', () => {
    // MEDIDO 2026-10-21: com o banco inalcançável, a API morre em ~2s
    // (Prisma P1001) e a etapa esperaria 60s à toa se a mensagem fosse
    // "não respondeu em 60s" — o sintoma real morava no log.
    const m = mensagemDeFalha(true, 'API', 60);
    expect(m).toContain('MORREU');
    expect(m).not.toContain('não respondeu');
  });

  it('diz que não respondeu quando o processo ficou de pé', () => {
    const m = mensagemDeFalha(false, 'web', 90);
    expect(m).toContain('90s');
    expect(m).not.toContain('MORREU');
  });

  it('acrescenta a dica quando há dica', () => {
    const m = mensagemDeFalha(true, 'API', 60, 'Veja docs/como-rodar.md §1.1.');
    expect(m).toContain('MORREU');
    expect(m).toContain('docs/como-rodar.md §1.1');
  });
});

describe('a etapa está fiada no ci:local e no pre-push', () => {
  // ⚠️ Sem esta spec, `ci:local` pode perder a etapa e continuar VERDE: o
  // script "diz a coisa certa enquanto faz outra" — a classe que o
  // `check-ci-local-e2e` já existe para fechar no lado das suítes e2e.
  // A asserção é sobre o COMANDO (palavra inteira), não sobre menção: um
  // comentário com o nome da etapa não a executa.
  it('o ci:local invoca a etapa de boot', () => {
    const ciLocal = packageRaiz().scripts?.['ci:local'] ?? '';
    expect(ciLocal).toMatch(/(?:^|[|&;\s])pnpm ci:boot(?:\s|$)/);
  });

  it('a etapa de boot aponta para o arquivo que a implementa', () => {
    const script = packageRaiz().scripts?.['ci:boot'] ?? '';
    expect(script).toContain('.tooling/scripts/ci/boot-local.ts');
  });

  it('o pre-push invoca a etapa de boot — a regra de subir a app antes do push', () => {
    // O dono pediu (2026-10-21): "a regra que deve rodar a aplicação
    // localmente todas as vezes antes de dar push". O hook é a casa da
    // regra; sem esta asserção, o hook pode perder a linha e o `ci:local`
    // continua verde sem nunca subir a aplicação.
    const hook = readFileSync(join(RAIZ, '.husky', 'pre-push'), 'utf8');
    expect(hook).toMatch(/^\s*pnpm ci:boot\b/m);
  });
});
