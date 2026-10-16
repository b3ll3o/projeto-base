import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkE2eFlowCoverage,
  lerInventario,
  reconciliarFluxosE2E,
  rotasDeclaradas,
  rotasDoApp,
  type SpecE2E,
} from './check-e2e-flow-coverage';

/**
 * Fixtures herméticas: convenção e specs são escritos num diretório temporário,
 * nunca lidos do repo real.
 *
 * Um gate cujo spec lê o objeto que ele mede prova que o repo está consistente
 * hoje, e quebra no primeiro dia em que o repo fica inconsistente de um jeito que
 * o autor não perceba — que é o dia em que ele precisa do gate. Aqui o
 * vermelho é construído, não herdado.
 */

const CONVENCAO = [
  '---',
  'name: e2e-playwright',
  '---',
  '',
  '## Inventário de Fluxos',
  '',
  '| Fluxo | Rota | Nome | Spec | Estados cobertos |',
  '|-------|------|------|------|-------------------|',
  '| F1 | `/users` | Listagem | `f1-listagem.spec.ts` | com dados |',
  '| F2 | `/users/novo` | Cadastro | `f2-cadastro.spec.ts` | sucesso |',
  '',
  ' prosa fora da tabela com `| F9 | pipes | que | nao-e-tabela | x |`',
  '',
].join('\n');

const SPEC_F1 = '// FLUXO: F1 — Listagem\ntest("x", () => {});\n';
const SPEC_F2 = '// FLUXO: F2 — Cadastro\ntest("y", () => {});\n';

/** As rotas que o inventário acima declara: o conjunto do disco, em paridade. */
const ROTAS = ['/users', '/users/novo'];

/**
 * Os specs do inventário, com os NOMES que a tabela declara.
 *
 * MEDIDO: a primeira versão desta fixture nomeava os arquivos `spec-0.spec.ts`,
 * `spec-1.spec.ts` — e o teste "verde quando os dois lados dizem a mesma coisa"
 * ficou VERMELHO com as duas divergências de nome. O gate estava certo: um
 * inventário que aponta para `f1-listagem.spec.ts` e um spec chamado
 * `spec-0.spec.ts` são dois lados desatualizados, mesmo que o conteúdo do
 * cabeçalho case. A fixture mentia sobre o repositório que ela representava.
 */
function specsDoInventario(...extras: string[]): SpecE2E[] {
  return [
    { arquivo: 'f1-listagem.spec.ts', conteudo: SPEC_F1 },
    { arquivo: 'f2-cadastro.spec.ts', conteudo: SPEC_F2 },
    ...extras.map((conteudo, i) => ({ arquivo: `extra-${i}.spec.ts`, conteudo })),
  ];
}

describe('lerInventario', () => {
  it('lê id e spec da tabela, ignorando a prosa que vem depois', () => {
    const { linhas, erro } = lerInventario(CONVENCAO);
    expect(erro).toBeUndefined();
    expect(linhas).toEqual([
      { id: 'F1', spec: 'f1-listagem.spec.ts', rotas: ['/users'] },
      { id: 'F2', spec: 'f2-cadastro.spec.ts', rotas: ['/users/novo'] },
    ]);
  });

  it('localiza a coluna Spec pelo cabeçalho, não pela posição', () => {
    // `Estados cobertos` antes de `Spec`: um parse posicional leria a coluna
    // errada e casaria fluxo com "com dados" — verde por acidente.
    const reordenada = CONVENCAO.replace(
      '| Fluxo | Rota | Nome | Spec | Estados cobertos |',
      '| Fluxo | Estados cobertos | Spec | Rota | Nome |',
    )
      .replace(
        '| F1 | `/users` | Listagem | `f1-listagem.spec.ts` | com dados |',
        '| F1 | com dados | `f1-listagem.spec.ts` | `/users` | Listagem |',
      )
      .replace(
        '| F2 | `/users/novo` | Cadastro | `f2-cadastro.spec.ts` | sucesso |',
        '| F2 | sucesso | `f2-cadastro.spec.ts` | `/users/novo` | Cadastro |',
      );
    const { linhas } = lerInventario(reordenada);
    expect(linhas.map((l) => l.spec)).toEqual(['f1-listagem.spec.ts', 'f2-cadastro.spec.ts']);
  });

  it('nomeia a seção faltando, em vez de devolver inventário vazio', () => {
    const { linhas, erro } = lerInventario('# Convenção\n\nsem inventário aqui\n');
    expect(linhas).toEqual([]);
    expect(erro).toContain('## Inventário de Fluxos');
  });

  it('nomeia a coluna faltando, em vez de usar índice fora da faixa', () => {
    const semColuna = CONVENCAO.replace(
      '| Fluxo | Rota | Nome | Spec | Estados cobertos |',
      '| Fluxo | Rota | Nome |',
    )
      .replace(
        '| F1 | `/users` | Listagem | `f1-listagem.spec.ts` | com dados |',
        '| F1 | `/users` | Listagem |',
      )
      .replace(
        '| F2 | `/users/novo` | Cadastro | `f2-cadastro.spec.ts` | sucesso |',
        '| F2 | `/users/novo` | Cadastro |',
      );
    const { linhas, erro } = lerInventario(semColuna);
    expect(linhas).toEqual([]);
    expect(erro).toContain('coluna "spec"');
  });
});

describe('reconciliarFluxosE2E', () => {
  it('verde quando inventário e specs dizem a mesma coisa', () => {
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: specsDoInventario(),
      rotas: ROTAS,
    });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.medidos).toBe(2);
    expect(r.rotasMedidas).toBe(2);
  });

  it('acusa spec que declara fluxo fora do inventário, nomeando os dois lados', () => {
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: specsDoInventario('// FLUXO: F7 — Inexistente\n'),
      rotas: ROTAS,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('extra-0.spec.ts');
    expect(r.errors.join('\n')).toContain('F7');
    expect(r.errors.join('\n')).toContain('e2e-playwright.md');
  });

  it('acusa fluxo do inventário sem spec que o declare', () => {
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: [{ arquivo: 'f1-listagem.spec.ts', conteudo: SPEC_F1 }],
      rotas: ROTAS,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('F2');
    expect(r.errors.join('\n')).toContain('nenhum spec declara esse fluxo');
  });

  it('acusa spec sem cabeçalho FLUXO:', () => {
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: specsDoInventario('test("órfão", () => {});\n'),
      rotas: ROTAS,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('extra-0.spec.ts');
    expect(r.errors.join('\n')).toContain('FLUXO');
  });

  it('acusa dois specs que declaram o mesmo fluxo', () => {
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: [
        { arquivo: 'f1-listagem.spec.ts', conteudo: SPEC_F1 },
        { arquivo: 'f1-outra.spec.ts', conteudo: SPEC_F1 },
        { arquivo: 'f2-cadastro.spec.ts', conteudo: SPEC_F2 },
      ],
      rotas: ROTAS,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('2 specs');
  });

  it('acusa inventário vazio — conjunto vazio passa vacuamente, e isso não é verde', () => {
    // As DUAS colunas existem e não há linha: o alvo do teste é a contagem
    // zero, não a coluna faltando.
    const vazio = '## Inventário de Fluxos\n\n| Fluxo | Rota | Spec |\n|---|---|---|\n';
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: vazio,
      specs: specsDoInventario(),
      rotas: ROTAS,
    });
    expect(r.ok).toBe(false);
    expect(r.medidos).toBe(0);
    expect(r.errors.join('\n')).toContain('0 linhas');
  });
});

// ─── O terceiro conjunto: as rotas do DISCO ───────────────────────────
//
// MEDIDO 2026-10-16: as duas reconciliações de cima comparavam o que foi
// escrito com o que foi escrito, e `/me/profile` — tela real, sem fluxo e sem
// spec — passava. Estes testes constroem esse buraco e cobram que ele fecha.
describe('rotas do disco', () => {
  it('acusa a rota que existe no código e não foi declarada — o buraco real', () => {
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: specsDoInventario(),
      rotas: [...ROTAS, '/me/profile'],
    });
    expect(r.ok).toBe(false);
    // A mensagem nomeia o path: um erro "há rotas não cobertas" obriga quem lê
    // a abrir o inventário e comparar por conta própria.
    expect(r.errors.join('\n')).toContain('/me/profile');
    expect(r.errors.join('\n')).toContain('e2e-playwright.md');
  });

  it('uma rota que percorre outra rota conta como declarada (F2-F6 são a mesma tela)', () => {
    // F2 descreve `/users/novo → /login?cadastrado=1 → /users`: o disco tem
    // três `page.tsx`, e nenhum deles pode ser acusado por não estar na
    // PRIMEIRA posição do percurso.
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: specsDoInventario(),
      rotas: ROTAS,
    });
    expect(r.ok).toBe(true);
  });

  it('zero rotas é erro, não verde — conjunto vazio passa vacuamente', () => {
    const r = reconciliarFluxosE2E({
      convencaoMarkdown: CONVENCAO,
      specs: specsDoInventario(),
      rotas: [],
    });
    expect(r.ok).toBe(false);
    expect(r.rotasMedidas).toBe(0);
    expect(r.errors.join('\n')).toContain('nenhuma rota foi derivada');
  });

  it('nomi a coluna Rota faltando, em vez de reconciliar só consigo mesmo', () => {
    const semColuna = CONVENCAO.replace(
      '| Fluxo | Rota | Nome | Spec | Estados cobertos |',
      '| Fluxo | Nome | Spec | Estados cobertos |',
    )
      .replace(
        '| F1 | `/users` | Listagem | `f1-listagem.spec.ts` | com dados |',
        '| F1 | Listagem | `f1-listagem.spec.ts` | com dados |',
      )
      .replace(
        '| F2 | `/users/novo` | Cadastro | `f2-cadastro.spec.ts` | sucesso |',
        '| F2 | Cadastro | `f2-cadastro.spec.ts` | sucesso |',
      );
    const { linhas, erro } = lerInventario(semColuna);
    expect(linhas).toEqual([]);
    expect(erro).toContain('coluna "rota"');
  });

  it('separa os três tokens de um percurso e descarta a query string', () => {
    expect(rotasDeclaradas('`/users/novo` → `/login?cadastrado=1` → `/users`')).toEqual([
      '/users/novo',
      '/login',
      '/users',
    ]);
    expect(rotasDeclaradas('`/` ↔ `/users` ↔ `/users/novo`')).toEqual([
      '/',
      '/users',
      '/users/novo',
    ]);
    // Segmento dinâmico é a rota, e a barra final não muda o endereço.
    expect(rotasDeclaradas('`/admin/profiles/[slug]`')).toEqual(['/admin/profiles/[slug]']);
    expect(rotasDeclaradas('`/users/`')).toEqual(['/users']);
  });

  it('deriva as rotas do App Router a partir dos page.tsx, recursivamente', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'rotas-do-app-'));
    mkdirSync(join(raiz, 'admin/profiles/[slug]'), { recursive: true });
    mkdirSync(join(raiz, 'users/novo'), { recursive: true });
    writeFileSync(join(raiz, 'page.tsx'), '');
    writeFileSync(join(raiz, 'users/page.tsx'), '');
    writeFileSync(join(raiz, 'users/novo/page.tsx'), '');
    writeFileSync(join(raiz, 'admin/profiles/[slug]/page.tsx'), '');
    // `layout.tsx` NÃO é rota: quem prova isso é ele não aparecer na lista.
    writeFileSync(join(raiz, 'users/layout.tsx'), '');

    expect(rotasDoApp(raiz)).toEqual(['/', '/admin/profiles/[slug]', '/users', '/users/novo']);
  });
});

describe('checkE2eFlowCoverage (repo de mentira)', () => {
  /** Só as convenções — sem `apps/web/e2e`. */
  function repoSemE2E(): string {
    const raiz = mkdtempSync(join(tmpdir(), 'check-e2e-'));
    mkdirSync(join(raiz, '.agents/specs/conventions'), { recursive: true });
    writeFileSync(join(raiz, '.agents/specs/conventions/e2e-playwright.md'), CONVENCAO);
    return raiz;
  }

  /** Convenção + diretório de e2e vazio. */
  function repoFalso(): string {
    const raiz = repoSemE2E();
    mkdirSync(join(raiz, 'apps/web/e2e'), { recursive: true });
    return raiz;
  }

  /** Convenção + specs, sem `apps/web/app` — um template sem frontend. */
  function repoFalsoComSpecs(): string {
    const raiz = repoFalso();
    writeFileSync(join(raiz, 'apps/web/e2e/f1-listagem.spec.ts'), SPEC_F1);
    writeFileSync(join(raiz, 'apps/web/e2e/f2-cadastro.spec.ts'), SPEC_F2);
    return raiz;
  }

  /** Convenção + diretório de e2e com os dois specs do inventário + as rotas. */
  function repoCompleto(): string {
    const raiz = repoFalso();
    writeFileSync(join(raiz, 'apps/web/e2e/f1-listagem.spec.ts'), SPEC_F1);
    writeFileSync(join(raiz, 'apps/web/e2e/f2-cadastro.spec.ts'), SPEC_F2);
    // As DUAS rotas que o inventário declara. Sem esta pasta o gate responde
    // `skipped` — e um "verde com ressalva" aqui seria verde sem ter medido
    // nada, que é exatamente o defeito que o resto deste arquivo combate.
    mkdirSync(join(raiz, 'apps/web/app/users/novo'), { recursive: true });
    writeFileSync(join(raiz, 'apps/web/app/users/page.tsx'), '');
    writeFileSync(join(raiz, 'apps/web/app/users/novo/page.tsx'), '');
    return raiz;
  }

  it('skip declarado quando a convenção não existe — nada a reconciliar', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'check-e2e-'));
    const r = checkE2eFlowCoverage({ repoRoot: raiz });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('e2e-playwright.md');
  });

  it('skip declarado quando o diretório de e2e não existe', () => {
    // MEDIDO: a primeira versão desta fixture chamava `repoFalso()`, que
    // CRIA `apps/web/e2e` — então o `skip` não vinha, e o teste falhava
    // affirmando `skipped` num resultado que não o tinha. A fixture
    // representava um repositório diferente do que o nome dizia.
    const r = checkE2eFlowCoverage({ repoRoot: repoSemE2E() });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('e2e');
  });

  it('acusa diretório de e2e sem nenhum spec — verde por ausência de objeto', () => {
    const r = checkE2eFlowCoverage({ repoRoot: repoFalso() });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('nenhum *.spec.ts');
  });

  it('verde com a ressalva de que mede paridade, não execução', () => {
    const r = checkE2eFlowCoverage({ repoRoot: repoCompleto() });
    expect(r.ok).toBe(true);
    expect(r.advisories?.join('\n')).toContain('DECLARATIVA');
    // E a ressalva diz o número de rotas conferidas: um "tudo certo" sem
    // denominador é o que a memória `criterion-inert-on-empty-set` descreve.
    expect(r.advisories?.join('\n')).toContain('2 rota(s) de página');
  });

  it('skip declarado quando o app não tem diretório de páginas', () => {
    const r = checkE2eFlowCoverage({ repoRoot: repoFalsoComSpecs() });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('apps/web/app');
  });

  it('acusa o meio-cumprido: spec novo sem linha no inventário', () => {
    const raiz = repoCompleto();
    writeFileSync(join(raiz, 'apps/web/e2e/f3-novo.spec.ts'), '// FLUXO: F3 — Novo\n');
    const r = checkE2eFlowCoverage({ repoRoot: raiz });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('F3');
  });

  it('acusa a tela nova no código sem fluxo — o caso que passou em 2026-10-16', () => {
    // Este é o teste do gate INTEIRO pela ponta do CLI real: o invêntário e os
    // specs continuam em paridade (13⇄13) e mesmo assim a rota sem linha
    // derruba o resultado. Sem ele, `repoCompleto()` acima continuaria verde
    // para sempre, porque paridade consigo mesmo é o estado que ele consagra.
    const raiz = repoCompleto();
    mkdirSync(join(raiz, 'apps/web/app/me/profile'), { recursive: true });
    writeFileSync(join(raiz, 'apps/web/app/me/profile/page.tsx'), '');

    const r = checkE2eFlowCoverage({ repoRoot: raiz });

    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('/me/profile');
  });
});
