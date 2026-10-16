import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkRunbookDrift, extrairChavesEnv, extrairScriptsPnpm } from './check-runbook-drift';

/** Embrulha um trecho em bloco cercado — o gate só lê blocos de código. */
function bloco(conteudo: string): string {
  return ['```bash', conteudo, '```'].join('\n');
}

describe('extrairScriptsPnpm', () => {
  it('extrai `pnpm dev` e `pnpm ci:local`', () => {
    const doc = ['```bash', 'pnpm dev', 'pnpm ci:local', '```'].join('\n');
    expect(extrairScriptsPnpm(doc).sort()).toEqual(['ci:local', 'dev']);
  });

  it('NÃO extrai a forma `pnpm exec X` (X é binário, não script)', () => {
    expect(extrairScriptsPnpm(bloco('pnpm exec prisma migrate deploy'))).toEqual([]);
  });

  it('NÃO extrai `pnpm --filter @projeto/web exec playwright install`', () => {
    expect(extrairScriptsPnpm(bloco('pnpm --filter @projeto/web exec playwright install'))).toEqual(
      [],
    );
  });

  it('NÃO extrai `pnpm turbo run db:generate` (task do turbo, não script da raiz)', () => {
    expect(extrairScriptsPnpm(bloco('pnpm turbo run db:generate'))).toEqual([]);
  });

  it('NÃO extrai flags nem builtins do pnpm', () => {
    expect(extrairScriptsPnpm(bloco('pnpm install --frozen-lockfile\npnpm --version'))).toEqual([]);
  });

  it('deduplica', () => {
    expect(extrairScriptsPnpm(bloco('pnpm dev\npnpm dev\npnpm dev'))).toEqual(['dev']);
  });

  it('NÃO extrai `pnpm X` citado em prosa fora de bloco de código', () => {
    // MEDIDO 2026-10-16: sem esta restrição o gate acusou 5 falsos positivos no
    // runbook real — "pnpm nativo", "pnpm responde", "workspace pnpm as deps".
    // Prosa não é comando copiável; bloco de código é.
    const doc = [
      '## Ambiente 1 — Dev local, pnpm nativo',
      'o pnpm responde "None of..."',
      'Num workspace pnpm as deps ficam em apps/*/node_modules',
    ].join('\n');
    expect(extrairScriptsPnpm(doc)).toEqual([]);
  });

  it('extrai de dentro de bloco cercado, com ou sem linguagem', () => {
    const doc = ['```bash', 'pnpm dev', '```', '```', 'pnpm build', '```'].join('\n');
    expect(extrairScriptsPnpm(doc).sort()).toEqual(['build', 'dev']);
  });

  it('extrai de bloco indentado (lista)', () => {
    const doc = ['- rode:', '  ```bash', '  pnpm dev', '  ```'].join('\n');
    expect(extrairScriptsPnpm(doc)).toEqual(['dev']);
  });
});

describe('extrairChavesEnv', () => {
  it('extrai as chaves da tabela de variáveis do runbook', () => {
    const doc = ['| `JWT_SECRET` | x | y |', '| `DATABASE_URL` | x | y |'].join('\n');
    expect(extrairChavesEnv(doc).sort()).toEqual(['DATABASE_URL', 'JWT_SECRET']);
  });

  it('NÃO extrai chave que não está na tabela (menção solta em prosa)', () => {
    expect(extrairChavesEnv('sem chaves aqui')).toEqual([]);
  });
});

describe('checkRunbookDrift', () => {
  let tmp: string;
  let repo: string;
  let docPath: string;

  function escreverDoc(conteudo: string): void {
    writeFileSync(join(repo, 'docs/como-rodar.md'), conteudo);
  }

  function escreverRaiz(scripts: Record<string, string>): void {
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x', scripts }, null, 2));
  }

  function escreverEnvExample(nome: string, conteudo: string): void {
    writeFileSync(join(repo, nome), conteudo);
  }

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'runbook-drift-'));
    repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'docs'), { recursive: true });
    docPath = join(repo, 'docs/como-rodar.md');
    escreverRaiz({ dev: 'turbo run dev', 'ci:local': 'x', build: 'y' });
    escreverEnvExample(
      '.env.production.example',
      'POSTGRES_PASSWORD=CHANGE_ME\nJWT_SECRET=CHANGE_ME\n',
    );
    escreverDoc(
      [
        '# Como rodar',
        '',
        '```bash',
        'pnpm dev',
        'pnpm ci:local',
        'pnpm exec prisma migrate deploy',
        '```',
        '',
        '| Variável | Onde mora | Consumida por |',
        '|---|---|---|',
        '| `JWT_SECRET` | a | b |',
        '| `POSTGRES_PASSWORD` | a | b |',
        '',
      ].join('\n'),
    );
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('doc e repo coerentes → verde', async () => {
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('script citado no doc que não existe no package.json → VERMELHO, nomeando o script', async () => {
    escreverDoc('# Como rodar\n\n```bash\npnpm dev\npnpm script-fantasma\n```\n');
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('script-fantasma');
  });

  it('script que EXISTE em app do workspace mas não na raiz → verde (o doc fala de workspace)', async () => {
    mkdirSync(join(repo, 'apps/web'), { recursive: true });
    writeFileSync(
      join(repo, 'apps/web/package.json'),
      JSON.stringify({ name: '@projeto/web', scripts: { 'test:e2e': 'playwright test' } }, null, 2),
    );
    escreverDoc('# Como rodar\n\n```bash\npnpm test:e2e\n```\n');
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    expect(r.errors).toEqual([]);
  });

  it('chave de env citada que sumiu do .env.example → VERMELHO, nomeando a chave', async () => {
    escreverEnvExample('.env.production.example', 'POSTGRES_PASSWORD=CHANGE_ME\n');
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('JWT_SECRET');
  });

  it('chave que só existe no exemplo de um app conta como válida', async () => {
    mkdirSync(join(repo, 'apps/web'), { recursive: true });
    escreverEnvExample('apps/web/.env.example', 'NEXT_PUBLIC_OTEL_SERVICE_NAME=x\n');
    escreverDoc(
      '# Como rodar\n\n| Variável | a | b |\n|---|---|---|\n| `NEXT_PUBLIC_OTEL_SERVICE_NAME` | a | b |\n',
    );
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    expect(r.errors).toEqual([]);
  });

  it('runbook ausente → skipped COM MOTIVO (não verde por ausência — classe 5)', async () => {
    rmSync(docPath);
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('como-rodar');
  });

  it('nenhum .env.example no repo → a regra de env não acusa nada, o resto ainda roda', async () => {
    rmSync(join(repo, '.env.production.example'));
    escreverDoc('# Como rodar\n\n```bash\npnpm dev\npnpm script-fantasma\n```\n');
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    expect(r.errors.join('\n')).toContain('script-fantasma');
    expect(r.errors.join('\n')).not.toContain('JWT_SECRET');
  });
});
