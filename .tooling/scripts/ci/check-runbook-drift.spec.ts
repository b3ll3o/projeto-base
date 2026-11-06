import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SUPERFICIES_DO_CONTAINER,
  checkNomeDoContainer,
  checkRunbookDrift,
  comparaNomesDoContainer,
  extrairChavesEnv,
  extrairScriptsPnpm,
  nomeDoContainerNoCodigo,
  nomesDoContainerEmComandos,
} from './check-runbook-drift';

/** A raiz do repo — as specs do gate real leem as superfícies de verdade. */
const RAIZ = resolve(__dirname, '..', '..', '..');

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

  /**
   * O gate mede os arquivos VERSIONADOS — quem escreve um arquivo novo
   * precisa versioná-lo, senão o gate (com razão) não o enxerga.
   */
  function versionar(): void {
    execFileSync('git', ['add', '-A'], { cwd: repo });
  }

  /**
   * As superfícies de código que guardam o nome do container.
   *
   * ⚠️ O FIXTURE tem de ter a FORMA do repo real: o gate lê 3 superfícies
   * (o runbook, o app e o tooling), e um fixture que só tem o runbook mediria
   * "superfície ausente" em todo teste — que é uma falha do fixture, não do
   * gate. (A mesma lição da spec que fixa a FORMA do arquivo real.)
   */
  function escreverSuperficiesDoContainer(
    nome: string = 'projeto-base-pg-local',
    nomes: Partial<Record<'app' | 'tooling' | 'pre-push', string>> = {},
  ): void {
    const app = join(repo, 'apps/api/src/shared/infrastructure/prisma');
    const tooling = join(repo, '.tooling/scripts/ci');
    const hook = join(repo, '.husky');
    mkdirSync(app, { recursive: true });
    mkdirSync(tooling, { recursive: true });
    mkdirSync(hook, { recursive: true });
    const nomeApp = nomes['app'] ?? nome;
    const nomeTooling = nomes['tooling'] ?? nome;
    const nomeHook = nomes['pre-push'] ?? nome;
    writeFileSync(
      join(app, 'traducao-de-falha-de-conexao.ts'),
      `// o container à parte, o \`${nome}\`.\nconst CONTAINER_DO_BANCO_LOCAL = '${nomeApp}';\n`,
    );
    writeFileSync(
      join(tooling, 'ambiente-local.ts'),
      `export const CONTAINER_DO_BANCO_LOCAL = '${nomeTooling}';\n`,
    );
    writeFileSync(
      join(hook, 'pre-push'),
      `#!/bin/sh\necho "   O banco local é pré-requisito: docker start ${nomeHook}"\n`,
    );
  }

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'runbook-drift-'));
    repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'docs'), { recursive: true });
    docPath = join(repo, 'docs/como-rodar.md');
    // ⚠️ O FIXTURE tem de ter a FORMA do repo real: o gate mede os
    // `.env.example` VERSIONADOS (`git ls-files`), e é o `.gitignore` do repo
    // que exclui o `node_modules` — uma fonte só. Um fixture sem git mediria
    // o caminho de reserva, e o caminho principal ficaria sem spec.
    execFileSync('git', ['init', '-q'], { cwd: repo });
    writeFileSync(join(repo, '.gitignore'), 'node_modules\n');
    escreverRaiz({ dev: 'turbo run dev', 'ci:local': 'x', build: 'y' });
    escreverEnvExample(
      '.env.production.example',
      'POSTGRES_PASSWORD=CHANGE_ME\nJWT_SECRET=CHANGE_ME\n',
    );
    escreverSuperficiesDoContainer();
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
        '```bash',
        'docker run -d --name projeto-base-pg-local -p 5432:5432 postgres:16-alpine',
        '```',
        '',
        'para derrubar, `docker rm -f projeto-base-pg-local`; para reiniciar,',
        '`docker start projeto-base-pg-local`.',
        '',
        '| Variável | Onde mora | Consumida por |',
        '|---|---|---|',
        '| `JWT_SECRET` | a | b |',
        '| `POSTGRES_PASSWORD` | a | b |',
        '',
      ].join('\n'),
    );
    // O gate mede o que está VERSIONADO — o índice precisa dos arquivos.
    execFileSync('git', ['add', '-A'], { cwd: repo });
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
    versionar();
    // ⚠️ O doc reescrito tem de manter a receita do container: a 3ª classe é
    // uma regra INDEPENDENTE, e um doc sem receita é um doc que ela acusa.
    escreverDoc(
      '# Como rodar\n\n```bash\ndocker run -d --name projeto-base-pg-local -p 5432:5432 postgres:16-alpine\n```\n\n' +
        '| Variável | a | b |\n|---|---|---|\n| `NEXT_PUBLIC_OTEL_SERVICE_NAME` | a | b |\n',
    );
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    expect(r.errors).toEqual([]);
  });

  // ⚠️ A LISTA DE `.env.example` era ESCRITA À MÃO (achado M2): os 4 caminhos
  // literais eram a varredura INTEIRA, e um `.env.example` novo em outro
  // pacote não entrava — e a lista não estava em asserção de spec nenhuma.
  // Com a lista escrita à mão, esta spec fica VERMELHA.
  it('chave que só existe no exemplo de um pacote NOVO (fora dos 4 literais) conta como válida', async () => {
    mkdirSync(join(repo, 'packages/novo'), { recursive: true });
    escreverEnvExample('packages/novo/.env.example', 'CHAVE_DO_PACOTE_NOVO=x\n');
    versionar();
    escreverDoc(
      '# Como rodar\n\n```bash\ndocker run -d --name projeto-base-pg-local -p 5432:5432 postgres:16-alpine\n```\n\n' +
        '| Variável | a | b |\n|---|---|---|\n| `CHAVE_DO_PACOTE_NOVO` | a | b |\n',
    );
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('NÃO varre o node_modules (lá há .env.example de pacote publicado)', async () => {
    mkdirSync(join(repo, 'node_modules/pacote'), { recursive: true });
    escreverEnvExample('node_modules/pacote/.env.example', 'CHAVE_DE_TERCEIRO=x\n');
    versionar();
    escreverDoc(
      '# Como rodar\n\n```bash\ndocker run -d --name projeto-base-pg-local -p 5432:5432 postgres:16-alpine\n```\n\n' +
        '| Variável | a | b |\n|---|---|---|\n| `CHAVE_DE_TERCEIRO` | a | b |\n',
    );
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    // A chave de terceiro NÃO conta como válida — a varredura é do REPO, e quem
    // exclui o `node_modules` é o `.gitignore` (uma fonte só).
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('CHAVE_DE_TERCEIRO');
  });

  // ⚠️ A RESERVA (sem git): um gate cujo escopo encolhe em silêncio é a
  // falha que este gate existe para eliminar — então a queda para o
  // filesystem é **declarada**, não silenciosa.
  it('sem git: a varredura cai no filesystem e o gate DIZ que o escopo encolheu', async () => {
    rmSync(join(repo, '.git'), { recursive: true, force: true });
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    expect(r.ok).toBe(true);
    expect(r.advisories?.join('\n')).toContain('git indisponível');
  });

  it('sem git: a RESERVA também não varre o node_modules', async () => {
    rmSync(join(repo, '.git'), { recursive: true, force: true });
    mkdirSync(join(repo, 'node_modules/pacote'), { recursive: true });
    escreverEnvExample('node_modules/pacote/.env.example', 'CHAVE_DE_TERCEIRO=x\n');
    escreverDoc(
      '# Como rodar\n\n```bash\ndocker run -d --name projeto-base-pg-local -p 5432:5432 postgres:16-alpine\n```\n\n' +
        '| Variável | a | b |\n|---|---|---|\n| `CHAVE_DE_TERCEIRO` | a | b |\n',
    );
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    // ⚠️ SEM este teste, tirar o `node_modules` da lista de pulo da RESERVA
    // deixava a suíte VERDE — a spec acima mede o caminho do git, e a lista de
    // pulo só existe na reserva.
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('CHAVE_DE_TERCEIRO');
  });

  it('com git: o gate NÃO avisa que o escopo encolheu (o aviso é do caminho de reserva)', async () => {
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    expect(r.ok).toBe(true);
    // ⚠️ Sem este teste, desligar o `git ls-files` (e usar a reserva sempre)
    // deixava a suíte VERDE — e o gate passaria a anunciar um escopo
    // encolhido que não encolheu.
    expect(r.advisories ?? []).toEqual([]);
  });

  // ⚠️ O achado I-02 da revisão do #144: com o índice apenas (`git ls-files`
  // sem `--others`), um `.env.example` NOVO — ainda não versionado — não era
  // visto, e o gate acusava uma chave que ESTAVA no disco. Um falso positivo
  // que barra o pre-push e aponta para um arquivo que já está certo.
  it('um .env.example NOVO, ainda não versionado, conta como válido', async () => {
    mkdirSync(join(repo, 'packages/novo'), { recursive: true });
    escreverEnvExample('packages/novo/.env.example', 'CHAVE_DO_PACOTE_NOVO=x\n');
    // ⚠️ SEM `versionar()` de propósito — o arquivo está no disco, e no índice
    // está só o que a `beforeEach` versionou.
    escreverDoc(
      '# Como rodar\n\n```bash\ndocker run -d --name projeto-base-pg-local -p 5432:5432 postgres:16-alpine\n```\n\n' +
        '| Variável | a | b |\n|---|---|---|\n| `CHAVE_DO_PACOTE_NOVO` | a | b |\n',
    );
    const r = await checkRunbookDrift({ repoRoot: repo, docPath });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
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

  it('⚠️ pelo CAMINHO REAL (checkRunbookDrift): superfícies divergentes → VERMELHO', async () => {
    // ⚠️ Esta spec existe porque as outras chamavam `comparaNomesDoContainer`
    // DIRETO — e assim a LIGAÇÃO entre o gate e a 3ª classe podia ser
    // desligada sem que NENHUM teste caísse. MEDIDO: comentando a linha que
    // chama `checkNomeDoContainer`, a suíte ficava 24/24 verde.
    escreverSuperficiesDoContainer('projeto-base-pg-local', { app: 'pg-divergente' });

    const r = await checkRunbookDrift({ repoRoot: repo, docPath });

    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('diverge');
    expect(r.errors.join('\n')).toContain('pg-divergente');
  });

  it('pelo CAMINHO REAL: o hook com o nome VELHO → VERMELHO (o pre-push é uma das cópias)', async () => {
    escreverSuperficiesDoContainer('projeto-base-pg-local', { 'pre-push': 'pg-velho-no-hook' });

    const r = await checkRunbookDrift({ repoRoot: repo, docPath });

    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('pre-push=pg-velho-no-hook');
  });

  it('pelo CAMINHO REAL: o runbook com o nome VELHO (a citação com ASPAS) → VERMELHO', async () => {
    // ⚠️ A citação com aspas é a forma mais natural de escrever — e a 1ª
    // versão do regex a ignorava, e aí o DONO sumia da comparação em silêncio.
    escreverDoc(
      '# Como rodar\n\n```bash\ndocker run -d --name "pg-velho-no-runbook" -p 5432:5432 postgres:16-alpine\n```\n',
    );

    const r = await checkRunbookDrift({ repoRoot: repo, docPath });

    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('pg-velho-no-runbook');
  });

  it('pelo CAMINHO REAL: o runbook ausente NÃO esconde a divergência entre o app e o tooling', async () => {
    // ⚠️ A 3ª classe não precisa do runbook: o app e o tooling são CÓDIGO.
    // Carregar o `skipped` junto com ela seria verde por ausência.
    rmSync(docPath);
    escreverSuperficiesDoContainer('projeto-base-pg-local', { tooling: 'pg-divergente' });

    const r = await checkRunbookDrift({ repoRoot: repo, docPath });

    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('diverge');
  });
});

describe('o nome do container do banco local (a 3ª classe de claim)', () => {
  it('as 3 superfícies com o MESMO nome → verde', async () => {
    const erros = await checkNomeDoContainer({
      repoRoot: RAIZ,
      doc: 'docker run -d --name projeto-base-pg-local -p 5432:5432 postgres:16-alpine\n',
    });

    expect(erros).toEqual([]);
  });

  it('o app com um nome DIFERENTE do runbook → VERMELHO, nomeando as duas superfícies', async () => {
    const erros = await checkNomeDoContainer({
      repoRoot: RAIZ,
      doc: 'docker run -d --name projeto-base-pg-local -p 5432:5432 postgres:16-alpine\n',
    });
    // O repo REAL está coerente — o erro simulado é o da superfície do app.
    expect(erros).toEqual([]);

    const divergente = comparaNomesDoContainer([
      {
        rotulo: 'runbook',
        caminho: 'docs/como-rodar.md',
        nomes: ['projeto-base-pg-local'],
        exigida: false,
      },
      {
        rotulo: 'app',
        caminho: 'apps/api/.../traducao-de-falha-de-conexao.ts',
        nomes: ['pg-velho'],
        exigida: true,
      },
      {
        rotulo: 'tooling',
        caminho: '.tooling/scripts/ci/ambiente-local.ts',
        nomes: ['pg-velho'],
        exigida: true,
      },
    ]);

    expect(divergente).toHaveLength(1);
    expect(divergente[0]).toContain('runbook=projeto-base-pg-local');
    expect(divergente[0]).toContain('app=pg-velho');
    expect(divergente[0]).toContain('tooling=pg-velho');
  });

  it('uma superfície AUSENTE → VERMELHO (verde por ausência é a classe 5)', async () => {
    const erros = comparaNomesDoContainer([
      {
        rotulo: 'runbook',
        caminho: 'docs/como-rodar.md',
        nomes: ['projeto-base-pg-local'],
        exigida: false,
      },
      {
        rotulo: 'app',
        caminho: 'apps/api/.../traducao-de-falha-de-conexao.ts',
        nomes: [],
        exigida: true,
      },
      {
        rotulo: 'tooling',
        caminho: '.tooling/scripts/ci/ambiente-local.ts',
        nomes: ['projeto-base-pg-local'],
        exigida: true,
      },
    ]);

    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain('não achei o nome do container');
    expect(erros[0]).toContain('app');
  });

  it('a extração ancorada na DECLARAÇÃO, e não na 1ª ocorrência do literal', () => {
    // O literal aparece ANTES, num COMENTÁRIO — e é o da declaração que vale.
    const codigo = [
      '// o container à parte, o `projeto-base-pg-local`.',
      "const CONTAINER_DO_BANCO_LOCAL = 'pg-certain';",
    ].join('\n');

    expect(nomeDoContainerNoCodigo(codigo)).toBe('pg-certain');
  });

  it('o runbook nomeia o container nas 3 formas: a receita, o derrube e o reinício', () => {
    expect(
      nomesDoContainerEmComandos(
        'docker run -d --name projeto-base-pg-local -p 5432:5432 postgres:16-alpine\n' +
          'para derrubar, `docker rm -f projeto-base-pg-local`;\n' +
          'para reiniciar, `docker start projeto-base-pg-local`.\n',
      ),
    ).toEqual(['projeto-base-pg-local']);
  });

  it('`docker compose stop <serviço>` NÃO é um nome de container', () => {
    expect(nomesDoContainerEmComandos('docker compose stop api\n')).toEqual([]);
  });

  it('o `--name` COM ASPAS é lido — a forma mais natural de escrever, e a que sumia da comparação', () => {
    // ⚠️ A 1ª versão do regex (`--name[= ]+`) devolvia `undefined` para esta
    // forma, e aí o DONO (o runbook) saía silenciosamente da comparação.
    expect(nomesDoContainerEmComandos('docker run -d --name "projeto-base-pg-NOVO" \\\n')).toEqual([
      'projeto-base-pg-NOVO',
    ]);
    expect(nomesDoContainerEmComandos("docker run -d --name 'projeto-base-pg-NOVO' \\\n")).toEqual([
      'projeto-base-pg-NOVO',
    ]);
  });

  it('a lista de superfícies tem 4 entradas, e os caminhos EXATOS (a lista é o que a spec prende)', () => {
    // ⚠️ A lista é a raiz do furo: MEDIDO, tirar a superfície 'app' da lista
    // (ou apontá-la para o arquivo errado) deixava a suíte VERDE — o gate
    // passava a medir 2 superfícies e ninguém percebia. O mesmo motivo da
    // lista de footers do #126.
    expect(SUPERFICIES_DO_CONTAINER).toHaveLength(4);
    expect(SUPERFICIES_DO_CONTAINER.map((s) => s.caminho)).toEqual([
      'docs/como-rodar.md',
      'apps/api/src/shared/infrastructure/prisma/traducao-de-falha-de-conexao.ts',
      '.tooling/scripts/ci/ambiente-local.ts',
      '.husky/pre-push',
    ]);
  });

  it('a mutação: renomear no app e NÃO no tooling → o gate reprova', async () => {
    // A PROVA de que o gate tem dente: com os 3 nomes iguais ele passa, e com
    // um deles trocado ele acusa — o que é exatamente o defeito que o #144
    // deixou aberto ("renomeou o container e o `pnpm dev` mandou `docker start`
    // de um nome que não existe").
    const iguais = comparaNomesDoContainer([
      {
        rotulo: 'runbook',
        caminho: 'docs/como-rodar.md',
        nomes: ['projeto-base-pg-local'],
        exigida: false,
      },
      { rotulo: 'app', caminho: 'x.ts', nomes: ['projeto-base-pg-local'], exigida: true },
      { rotulo: 'tooling', caminho: 'y.ts', nomes: ['projeto-base-pg-local'], exigida: true },
    ]);
    expect(iguais).toEqual([]);

    const divergentes = comparaNomesDoContainer([
      {
        rotulo: 'runbook',
        caminho: 'docs/como-rodar.md',
        nomes: ['projeto-base-pg-local'],
        exigida: false,
      },
      { rotulo: 'app', caminho: 'x.ts', nomes: ['pg-novo'], exigida: true },
      { rotulo: 'tooling', caminho: 'y.ts', nomes: ['projeto-base-pg-local'], exigida: true },
    ]);
    expect(divergentes).toHaveLength(1);
  });
});
