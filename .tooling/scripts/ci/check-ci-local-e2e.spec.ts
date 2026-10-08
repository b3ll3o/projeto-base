import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkCiLocalE2e,
  invocacoesTurboRun,
  reconciliarCiLocalE2e,
  type WorkspacePackage,
} from './check-ci-local-e2e';

/**
 * Fixtures herméticas: os `package.json` são escritos num diretório
 * temporário, nunca lidos do repo real. Um gate cujo spec lê o objeto que ele
 * mede prova que o repo está consistente hoje, e quebra no primeiro dia em
 * que o repo fica inconsistente de um jeito que o autor não perceba — que é o
 * dia em que ele precisa do gate. Aqui o vermelho é construído, não herdado.
 *
 * A EXCEÇÃO é o último bloco, `checkCiLocalE2e (repo real)`, e ela é
 * deliberada: o objeto que este gate mede é a fiação do próprio repo, então o
 * repo É a fixture. O mesmo padrão já existe em `check-teeth-registry.spec.ts`,
 * que reconcilia o registro de dentes real contra `PREFLIGHT_GATES`.
 */

const CI_LOCAL_OK =
  'pnpm ci:preflight && pnpm turbo run lint typecheck test:unit test:coverage ' +
  'test:integration test:e2e --filter=@projeto/api --filter=@projeto/web';

const PACOTE_API: WorkspacePackage = {
  name: '@projeto/api',
  dir: 'apps/api',
  scripts: {
    'test:integration': 'vitest run --config vitest.integration.config.ts',
    'test:e2e': 'vitest run --config vitest.e2e.config.ts',
  },
};

const PACOTE_WEB: WorkspacePackage = {
  name: '@projeto/web',
  dir: 'apps/web',
  scripts: {
    'test:e2e': 'playwright test',
    'pretest:e2e': 'playwright install chromium',
  },
};

/** Repo com os dois pacotes e o `ci:local` completo. */
function entradaOk(ciLocal: string | undefined = CI_LOCAL_OK, pacotes = [PACOTE_API, PACOTE_WEB]) {
  return { ciLocal, pacotes };
}

describe('invocacoesTurboRun', () => {
  const filtrosDe = (comando: string) => invocacoesTurboRun(comando).flatMap((i) => i.filtros);

  it('lê as duas formas, `--filter=x` e `--filter x`', () => {
    expect(filtrosDe('turbo run lint --filter=@projeto/api --filter @projeto/web')).toEqual([
      '@projeto/api',
      '@projeto/web',
    ]);
  });

  it('o alvo de um redirect não vira filtro', () => {
    // Sem isto, `turbo run test:e2e --filter >out.log` leria `out.log` como
    // pacote e acusaria um app que existe. O operador nu consome a próxima
    // palavra; a palavra é o alvo, não o valor do filtro.
    expect(filtrosDe('turbo run test:e2e --filter >out.log')).toEqual([]);
    expect(filtrosDe('turbo run test:e2e --filter=@projeto/api >out.log')).toEqual([
      '@projeto/api',
    ]);
  });

  it('um operador nu consome a palavra seguinte mesmo quando ela é outro filtro', () => {
    // `turbo run test:e2e --filter @a > --filter=@b`: o `>` nu faz de `--filter=@b`
    // o NOME DO ARQUIVO, e o bash real confirma — sem esta regra o valor viraria
    // um segundo filtro, e um pacote fora de alcance passaria por alcançado.
    expect(filtrosDe('turbo run test:e2e --filter @a > --filter=@b')).toEqual(['@a']);
  });

  it('aspas protegem o valor do filtro, inclusive um valor com espaço', () => {
    // O espaço dentro das aspas não separa token. Se a proteção for aplicada só na
    // abertura, sobra o sentinela de fechamento e o valor não casa com nenhum
    // pacote — o erro sairia apontando para um app que existe.
    expect(filtrosDe(`turbo run lint --filter='@projeto/api'`)).toEqual(['@projeto/api']);
    expect(filtrosDe(`turbo run lint --filter='@projeto/web app'`)).toEqual(['@projeto/web app']);
  });

  it('`&>` e `2>&1` não viram parte do valor do filtro', () => {
    expect(filtrosDe('turbo run test:e2e --filter=@projeto/api&>out.log')).toEqual([
      '@projeto/api',
    ]);
    expect(filtrosDe('turbo run test:e2e --filter=@projeto/api 2>&1')).toEqual(['@projeto/api']);
  });

  it('separa invocações, e cada uma devolve só os filtros dela', () => {
    // A forma que o `turbo run` do `ci:local` do repo real tem: uma invocação
    // só. O que interessa aqui é que as duas NÃO se misturem.
    const duas = invocacoesTurboRun(
      'turbo run lint --filter=@projeto/api && turbo run test:e2e --filter=@projeto/web',
    );
    expect(duas).toHaveLength(2);
    expect(duas[0]?.tasks).toEqual(['lint']);
    expect(duas[0]?.filtros).toEqual(['@projeto/api']);
    expect(duas[1]?.tasks).toEqual(['test:e2e']);
    expect(duas[1]?.filtros).toEqual(['@projeto/web']);
  });
});

describe('reconciliarCiLocalE2e', () => {
  it('verde quando `ci:local` traz as duas tasks e todo pacote de e2e é alcançado', () => {
    const r = reconciliarCiLocalE2e(entradaOk());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('acusa `ci:local` que não menciona `test:e2e`, nomeando a task e o que ele achou', () => {
    // Este é o defeito G-001 medido: o script existia, e não rodava a suíte.
    const r = reconciliarCiLocalE2e({
      ciLocal:
        'pnpm ci:preflight && pnpm turbo run lint typecheck test:unit test:coverage ' +
        '--filter=@projeto/api --filter=@projeto/web',
      pacotes: [PACOTE_API, PACOTE_WEB],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('test:e2e');
    // O erro tem de dizer o que ele achou, senão quem lê procura no escuro.
    expect(r.errors.join('\n')).toContain('test:integration');
  });

  it('acusa `ci:local` que não menciona `test:integration`', () => {
    const r = reconciliarCiLocalE2e({
      ciLocal: 'pnpm turbo run lint test:e2e --filter=@projeto/api --filter=@projeto/web',
      pacotes: [PACOTE_API, PACOTE_WEB],
    });
    expect(r.errors.join('\n')).toContain('test:integration');
  });

  it('acusa pacote de e2e fora dos `--filter` — o gate que passaria verde com um app novo', () => {
    // A forma comum: alguém acrescenta `apps/admin` com `test:e2e` e não toca
    // nos filtros. O turbo segue verde, o `ci:local` segue verde, e a suíte
    // nova nunca roda antes do push. Um gate que só olhasse as tasks passaria.
    const r = reconciliarCiLocalE2e({
      ciLocal: CI_LOCAL_OK,
      pacotes: [
        PACOTE_API,
        PACOTE_WEB,
        { name: '@projeto/admin', dir: 'apps/admin', scripts: { 'test:e2e': 'vitest run' } },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('@projeto/admin');
  });

  it('o filtro de uma invocação que NÃO roda e2e não alcança ninguém para o e2e', () => {
    //achado de 2026-10-08, medido por revisão: com os filtros coletados do
    // comando INTEIRO, `turbo run lint --filter=@projeto/api && turbo run
    // test:e2e --filter=@projeto/web` passava verde — e a suíte de `@projeto/api`
    // nunca rodava antes do push. Dividir o `ci:local` em estágios é a próxima
    // edição óbvia (o próprio plano mediu que as duas invocações custam o mesmo).
    const r = reconciliarCiLocalE2e({
      ciLocal:
        'pnpm turbo run lint --filter=@projeto/api && ' +
        'pnpm turbo run test:integration test:e2e --filter=@projeto/web',
      pacotes: [PACOTE_API, PACOTE_WEB],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('@projeto/api');
  });

  it('o sufixo `...` do turbo conta como alcance, não como nome exato', () => {
    // `--filter=@projeto/api...` é a forma documentada de "o pacote e seus
    // dependentes". Comparada por igualdade ela acusaria um pacote que ESTÁ
    // alcançado — o gate que berra por um motivo errado.
    const r = reconciliarCiLocalE2e({
      ciLocal: 'pnpm turbo run test:integration test:e2e --filter=@projeto/api...',
      pacotes: [PACOTE_API],
    });
    expect(r.errors).toEqual([]);
  });

  it('acusa pacote Playwright cujo `test:e2e` também contém `turbo run` — delegar não isenta do browser', () => {
    // `"test:e2e": "playwright test && turbo run test:e2e"` delega E roda. Ler
    // só o `turbo run` classificava o pacote como despachante e pulava as duas
    // conferências dele — que é exatamente o defeito que este gate existe para
    // pegar. A regra só isenta quem NÃO menciona browser.
    const r = reconciliarCiLocalE2e({
      ciLocal: CI_LOCAL_OK,
      pacotes: [
        PACOTE_API,
        {
          name: '@projeto/web',
          dir: 'apps/web',
          scripts: { 'test:e2e': 'playwright test && turbo run test:e2e' },
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('pretest:e2e');
  });

  it('sem nenhum `--filter` sai advisory, não silêncio', () => {
    // Hoje é semanticamente correto (sem filtro, o turbo roda em todos os
    // pacotes), mas é o único formato em que o gate pode ficar verde sem medir
    // alcance E sem deixar rastro. O rastro é o ponto.
    const r = reconciliarCiLocalE2e({
      ciLocal: 'pnpm turbo run test:integration test:e2e',
      pacotes: [PACOTE_API, PACOTE_WEB],
    });
    expect(r.errors).toEqual([]);
    expect(r.advisories.join('\n')).toContain('--filter');
  });

  it('não acusa quando o filtro é glob — indeterminado vai para advisories, não para errors', () => {
    const r = reconciliarCiLocalE2e({
      ciLocal: 'pnpm turbo run test:integration test:e2e --filter=@projeto/*',
      pacotes: [
        PACOTE_API,
        PACOTE_WEB,
        { name: '@projeto/admin', dir: 'apps/admin', scripts: { 'test:e2e': 'x' } },
      ],
    });
    expect(r.errors).toEqual([]);
    expect(r.advisories.join('\n')).toContain('glob');
  });

  it('acusa pacote Playwright sem `pretest:e2e`', () => {
    // G-003: sem browser a suíte levanta Postgres, API e `next build` (33,5 s
    // medidos) e só então falha falando de binário inexistente — 43,4 s até o
    // erro, pelo motivo errado.
    const r = reconciliarCiLocalE2e({
      ciLocal: CI_LOCAL_OK,
      pacotes: [
        PACOTE_API,
        { name: '@projeto/web', dir: 'apps/web', scripts: { 'test:e2e': 'playwright test' } },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('pretest:e2e');
    expect(r.errors.join('\n')).toContain('@projeto/web');
  });

  it('acusa `pretest:e2e` que não instala o browser', () => {
    const r = reconciliarCiLocalE2e({
      ciLocal: CI_LOCAL_OK,
      pacotes: [
        PACOTE_API,
        {
          name: '@projeto/web',
          dir: 'apps/web',
          scripts: { 'test:e2e': 'playwright test', 'pretest:e2e': 'echo ok' },
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('playwright install');
  });

  it('não exige `pretest:e2e` de pacote cujo e2e não é Playwright', () => {
    const r = reconciliarCiLocalE2e({
      ciLocal:
        'pnpm turbo run test:integration test:e2e --filter=@projeto/api --filter=@projeto/worker',
      pacotes: [
        PACOTE_API,
        { name: '@projeto/worker', dir: 'apps/worker', scripts: { 'test:e2e': 'vitest run' } },
      ],
    });
    expect(r.errors).toEqual([]);
  });

  it('não exige o pacote raiz, que apenas repassa a task ao turbo', () => {
    // MEDIDO 2026-10-08: o `package.json` raiz tem
    // `"test:e2e": "turbo run test:e2e"` — despachante, não suíte. Sem esta
    // regra o gate exigiria o raiz num `--filter` de `ci:local` e bloquearia
    // todo push por causa do script que faz a agregação.
    const r = reconciliarCiLocalE2e({
      ciLocal: CI_LOCAL_OK,
      pacotes: [
        { name: 'projeto-base', dir: '.', scripts: { 'test:e2e': 'turbo run test:e2e' } },
        PACOTE_API,
        PACOTE_WEB,
      ],
    });
    expect(r.errors).toEqual([]);
  });

  it('a delegação é detectada pelo parser, não por `includes` solto', () => {
    // `pnpm turbo run test:e2e` reescrito precisa continuar sendo delegação;
    // um `includes('turbo run')` deixaria de fora a forma com `pnpm` na frente.
    const r = reconciliarCiLocalE2e({
      ciLocal: CI_LOCAL_OK,
      pacotes: [
        { name: 'projeto-base', dir: '.', scripts: { 'test:e2e': 'pnpm turbo run test:e2e' } },
        PACOTE_API,
        PACOTE_WEB,
      ],
    });
    expect(r.errors).toEqual([]);
  });

  it('`ci:local` ausente é erro nomeando o script, não verde por ausência', () => {
    const r = reconciliarCiLocalE2e({ ciLocal: undefined, pacotes: [PACOTE_API] });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('ci:local');
  });
});

describe('checkCiLocalE2e (repo de mentira)', () => {
  function repoCom(pacotes: Record<string, Record<string, string>>, ciLocal?: string): string {
    const raiz = mkdtempSync(join(tmpdir(), 'check-ci-local-e2e-'));
    mkdirSync(join(raiz, 'apps'), { recursive: true });
    if (ciLocal !== undefined) {
      writeFileSync(
        join(raiz, 'package.json'),
        JSON.stringify({ name: 'raiz', scripts: { 'ci:local': ciLocal } }),
      );
    } else {
      writeFileSync(join(raiz, 'package.json'), JSON.stringify({ name: 'raiz', scripts: {} }));
    }
    writeFileSync(join(raiz, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
    for (const [dir, scripts] of Object.entries(pacotes)) {
      mkdirSync(join(raiz, 'apps', dir), { recursive: true });
      writeFileSync(
        join(raiz, 'apps', dir, 'package.json'),
        JSON.stringify({ name: `@projeto/${dir}`, scripts }),
      );
    }
    return raiz;
  }

  it('skip declarado quando o workspace não pode ser enumerado — e NÃO verde', async () => {
    // `[]` quer dizer duas coisas diferentes: "workspace sem e2e" e "não consegui
    // ler o workspace". Uma lista vazia devolvida como lista deixaria o caller
    // sem distinguir, e o gate pareceria verde sem ter olhado nada.
    const raiz = mkdtempSync(join(tmpdir(), 'check-ci-local-e2e-'));
    writeFileSync(
      join(raiz, 'package.json'),
      JSON.stringify({ scripts: { 'ci:local': CI_LOCAL_OK } }),
    );
    const r = await checkCiLocalE2e({ repoRoot: raiz });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('pnpm-workspace.yaml');
  });

  it('skip declarado quando nenhum pacote implementa `test:e2e`', async () => {
    const raiz = repoCom({ api: { 'test:integration': 'vitest run' } }, CI_LOCAL_OK);
    const r = await checkCiLocalE2e({ repoRoot: raiz });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('test:e2e');
  });

  it('verde com a ressalva de que mede fiação declarada, não execução', async () => {
    const raiz = repoCom(
      {
        api: PACOTE_API.scripts,
        web: { 'test:e2e': 'playwright test', 'pretest:e2e': 'playwright install chromium' },
      },
      CI_LOCAL_OK,
    );
    const r = await checkCiLocalE2e({ repoRoot: raiz });
    expect(r.ok).toBe(true);
    expect(r.advisories?.join('\n')).toContain('DECLARATIVA');
  });
});

describe('checkCiLocalE2e (repo real)', () => {
  // Único bloco que lê o repo de verdade, e ele é o que fecha a demanda: se
  // alguém encurtar `ci:local` de novo, este teste é o vermelho.
  const raiz = join(__dirname, '../../..');

  it('`ci:local` do repo de verdade roda as duas suítes e alcança todo pacote de e2e', async () => {
    const r = await checkCiLocalE2e({ repoRoot: raiz });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
