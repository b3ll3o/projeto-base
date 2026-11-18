import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONVENCAO,
  type DeclaracaoCondicional,
  type Entradas,
  type ItemDoKit,
  type PilarDoKit,
  casaAncora,
  celulasDaLinha,
  checkDocKit,
  coluna,
  declaraNaoAplicavel,
  globParaRegex,
  lacunasDoKit,
  lerMatriz,
} from './check-doc-kit';

/** Raiz do repo real — usada no caso "o repo real está coberto". */
const REPO_REAL = join(import.meta.dirname, '..', '..', '..');

/**
 * `tsx` e o script, derivados do PRÓPRIO spec — nunca de `process.cwd()`.
 *
 * O teste de CLI abaixo executa o gate; se qualquer um dos dois viesse do
 * `process.cwd()`, o teste mediria outro repo e passaria pelo motivo errado.
 */
const TSX = join(REPO_REAL, 'node_modules/.bin/tsx');
const SCRIPT = join(REPO_REAL, '.tooling/scripts/ci/check-doc-kit.ts');

/** Um item de matriz pronto, com o que a medição precisa. */
function item(over: Partial<ItemDoKit> = {}): ItemDoKit {
  return {
    numero: '1',
    item: 'README (A Vitrine)',
    pilar: 1,
    doc: 'README.md',
    tipo: 'arquivo',
    ancoras: ['## O que é'],
    indice: null,
    condicao: 'obrigatorio',
    specialist: 'readme-specialist',
    auditor: 'onboarding-docs-auditor',
    linha: 20,
    ...over,
  };
}

/** Os 5 pilares, lidos da §5.1. */
const PILARES: PilarDoKit[] = [
  { pilar: 1, auditor: 'onboarding-docs-auditor', skill: 'onboarding-docs-audit' },
  { pilar: 2, auditor: 'architecture-docs-auditor', skill: 'architecture-docs-audit' },
  { pilar: 3, auditor: 'decision-docs-auditor', skill: 'decision-docs-audit' },
  { pilar: 4, auditor: 'contract-docs-auditor', skill: 'contract-docs-audit' },
  { pilar: 5, auditor: 'operations-docs-auditor', skill: 'operations-docs-audit' },
];

/** As entradas de um kit sadio: os 5 pilares, cada um com doc, specialist e auditor. */
function entradas(sobre: Partial<Entradas> = {}): Entradas {
  const arquivos = new Map<string, string>([
    ['README.md', '# projeto-base\n\n## O que é\n\ntexto\n'],
    ['docs/prd/0001.md', '# PRD\n\n## Problema\n'],
    ['docs/tdr/0001.md', '# TDR\n\n## Proposta\n'],
    ['docs/adr/0001.md', '# ADR\n\n## Contexto\n'],
    ['docs/api/asyncapi.yaml', 'asyncapi: 3.0.0\n'],
    ['docs/system-design/README.md', '# System Design\n\n## §1. Ordem de leitura\n'],
    ['docs/runbooks/0001.md', '# Runbook\n\n## §1. O que é\n'],
    ['.agents/agents/readme-specialist.md', '---\nname: readme-specialist\n---\n'],
    ['.agents/agents/onboarding-docs-auditor.md', '---\nname: onboarding-docs-auditor\n---\n'],
    ['.agents/agents/prd-specialist.md', '---\nname: prd-specialist\n---\n'],
    ['.agents/agents/decision-docs-auditor.md', '---\nname: decision-docs-auditor\n---\n'],
    ['.agents/agents/asyncapi-specialist.md', '---\nname: asyncapi-specialist\n---\n'],
    ['.agents/agents/contract-docs-auditor.md', '---\nname: contract-docs-auditor\n---\n'],
    ['.agents/agents/architecture-docs-auditor.md', '---\nname: architecture-docs-auditor\n---\n'],
    ['.agents/agents/operations-docs-auditor.md', '---\nname: operations-docs-auditor\n---\n'],
    ['.agents/skills/onboarding-docs-audit/SKILL.md', '---\nname: onboarding-docs-audit\n---\n'],
    [
      '.agents/skills/architecture-docs-audit/SKILL.md',
      '---\nname: architecture-docs-audit\n---\n',
    ],
    ['.agents/skills/decision-docs-audit/SKILL.md', '---\nname: decision-docs-audit\n---\n'],
    ['.agents/skills/contract-docs-audit/SKILL.md', '---\nname: contract-docs-audit\n---\n'],
    ['.agents/skills/operations-docs-audit/SKILL.md', '---\nname: operations-docs-audit\n---\n'],
  ]);
  const itens: ItemDoKit[] = [
    item(),
    item({
      numero: '4',
      item: 'HLD',
      pilar: 2,
      doc: 'docs/system-design/README.md',
      ancoras: ['## §1. Ordem de leitura'],
      specialist: 'prd-specialist',
      auditor: 'architecture-docs-auditor',
    }),
    item({
      numero: '6',
      item: 'PRD',
      pilar: 3,
      doc: 'docs/prd/0001.md',
      ancoras: ['## Problema'],
      specialist: 'prd-specialist',
      auditor: 'decision-docs-auditor',
    }),
    item({
      numero: '10',
      item: 'AsyncAPI',
      pilar: 4,
      doc: 'docs/api/asyncapi.yaml',
      ancoras: ['asyncapi'],
      condicao: 'condicional',
      specialist: 'asyncapi-specialist',
      auditor: 'contract-docs-auditor',
    }),
    item({
      numero: '12',
      item: 'Runbooks',
      pilar: 5,
      doc: 'docs/runbooks/0001.md',
      ancoras: ['## §1.'],
      specialist: 'prd-specialist',
      auditor: 'operations-docs-auditor',
    }),
  ];
  return {
    itens,
    condicionais: [
      {
        item: 'AsyncAPI',
        gatilho: 'existe broker',
        sondas: ['package.json'],
        padrao: '"bullmq"',
        declaracao: 'sim — em 2026-11-18',
        linha: 90,
      },
    ],
    pilares: PILARES,
    existe: (c) => arquivos.has(c),
    ler: (c) => arquivos.get(c) ?? '',
    arquivos: (glob) => [...arquivos.keys()].filter((c) => globParaRegex(glob).test(c)),
    agentExiste: (n) => arquivos.has(`.agents/agents/${n}.md`),
    skillExiste: (n) => arquivos.has(`.agents/skills/${n}/SKILL.md`),
    sonda: () => 'nao-disparou',
    ...sobre,
  };
}

describe('celulasDaLinha', () => {
  it('divide a linha e tira as bordas', () => {
    expect(celulasDaLinha('| a | b |')).toEqual(['a', 'b']);
  });

  it('o pipe escapado NÃO vira coluna — o padrão da §4 usa isso', () => {
    expect(celulasDaLinha('| x | `"a"\\|"b"` |')).toEqual(['x', '`"a"|"b"`']);
  });
});

describe('coluna', () => {
  it('casa pelo nome exato', () => {
    expect(coluna(['Item', 'Doc canônico'], 'Doc canônico')).toBe(1);
  });

  it('casa por prefixo — "Sonda (glob)" é a coluna "Sonda"', () => {
    expect(coluna(['Item', 'Sonda (glob)'], 'Sonda')).toBe(1);
  });

  it('não casa com coluna que não existe', () => {
    expect(coluna(['Item', 'Tipo'], 'Doc canônico')).toBe(-1);
  });
});

describe('globParaRegex', () => {
  it('`*` não atravessa diretório, `**` atravessa', () => {
    expect(globParaRegex('docs/*.md').test('docs/a.md')).toBe(true);
    expect(globParaRegex('docs/*.md').test('docs/x/a.md')).toBe(false);
    expect(globParaRegex('docs/**/*.md').test('docs/x/a.md')).toBe(true);
  });

  it('o ponto do literal é literal', () => {
    expect(globParaRegex('README.md').test('READMEXmd')).toBe(false);
  });
});

describe('casaAncora', () => {
  it('casa com o heading exato', () => {
    expect(casaAncora('## Contexto', '# ADR\n\n## Contexto\n', 'arquivo')).toBe(true);
  });

  it('NÃO casa com um heading que só COMEÇA pela âncora em palavra', () => {
    // MEDIDO em 2026-11-18 (revisão do PR do kit): `## Contexto do Negocio`
    // satisfazia a âncora `## Contexto` quando a comparação era `includes`.
    expect(casaAncora('## Contexto', '# ADR\n\n## Contexto do Negocio\n', 'arquivo')).toBe(false);
  });

  it('a âncora que termina em pontuação casa por prefixo (o `## §1.`)', () => {
    expect(casaAncora('## §1.', '# Runbook\n\n## §1. Ambiente 2 — Dev local\n', 'arquivo')).toBe(
      true,
    );
  });

  it('a âncora NÃO casa com uma linha que não é heading', () => {
    expect(casaAncora('## O que é', 'o texto ## O que é no meio\n', 'arquivo')).toBe(false);
  });

  it('no artefato gerado, a âncora é a chave literal', () => {
    expect(casaAncora('"paths"', '{ "paths": {} }', 'artefato')).toBe(true);
    expect(casaAncora('"paths"', '{ "pathz": {} }', 'artefato')).toBe(false);
  });
});

describe('declaraNaoAplicavel', () => {
  it('só o "sim" declara a não-aplicabilidade', () => {
    expect(declaraNaoAplicavel('**sim** — em 2026-11-18')).toBe(true);
    expect(declaraNaoAplicavel('sim')).toBe(true);
  });

  it('"não" NÃO declara a não-aplicabilidade (o item SE APLICA)', () => {
    // MEDIDO em 2026-11-18 (revisão do PR do kit): o teste antigo era "a
    // célula está preenchida", e `**não**` contava como declaração.
    expect(declaraNaoAplicavel('**não**')).toBe(false);
    expect(declaraNaoAplicavel('')).toBe(false);
  });
});

describe('lerMatriz', () => {
  const md = [
    '## §2. A matriz',
    '',
    '### §2.1 Pilar 1 — Onboarding',
    '',
    '| # | Item | Doc canônico | Tipo | Âncoras | Índice | Condição | Specialist | Auditor |',
    '|---|---|---|---|---|---|---|---|---|',
    '| 1 | README | `README.md` | arquivo | `## O que é`; `## Documentação` | — | obrigatório | `readme-specialist` | `onboarding-docs-auditor` |',
    '',
    '### §2.4 Pilar 4 — Contratos',
    '',
    '| # | Item | Doc canônico | Tipo | Âncoras | Índice | Condição | Specialist | Auditor |',
    '|---|---|---|---|---|---|---|---|---|',
    '| 10 | AsyncAPI | `docs/api/asyncapi.yaml` | arquivo | `asyncapi` | — | condicional | `asyncapi-specialist` | `contract-docs-auditor` |',
    '',
    '## §4. Itens condicionais',
    '',
    '| Item | Gatilho | Sonda (glob) | Padrão | Não aplicável declarado |',
    '|---|---|---|---|---|',
    '| AsyncAPI | existe broker | `package.json` | `"bullmq"\\|"kafkajs"` | **sim** — em 2026-11-18 |',
    '',
    '## §5.1 Os auditores do kit',
    '',
    '| Pilar | Itens | Auditor | Skill de auditoria |',
    '|---|---|---|---|',
    '| 1 — Onboarding | 1, 2, 3 | `onboarding-docs-auditor` | `onboarding-docs-audit` |',
  ].join('\n');

  it('lê os itens e descobre o pilar pelo heading', () => {
    const m = lerMatriz(md);
    expect(m.itens).toHaveLength(2);
    expect(m.itens[0]!.pilar).toBe(1);
    expect(m.itens[1]!.pilar).toBe(4);
    expect(m.itens[0]!.ancoras).toEqual(['## O que é', '## Documentação']);
    expect(m.itens[0]!.indice).toBeNull();
    expect(m.itens[1]!.condicao).toBe('condicional');
    expect(m.pilaresVistos).toEqual([1, 4]);
  });

  it('lê a declaração condicional com a sonda e o padrão', () => {
    const m = lerMatriz(md);
    expect(m.condicionais).toHaveLength(1);
    expect(m.condicionais[0]!.item).toBe('AsyncAPI');
    expect(m.condicionais[0]!.sondas).toEqual(['package.json']);
    expect(m.condicionais[0]!.padrao).toBe('"bullmq"|"kafkajs"');
    expect(m.condicionais[0]!.declaracao).toContain('sim');
  });

  it('lê os pilares da §5.1 (o auditor e a skill de cada um)', () => {
    const m = lerMatriz(md);
    expect(m.pilares).toHaveLength(1);
    expect(m.pilares[0]!.pilar).toBe(1);
    expect(m.pilares[0]!.auditor).toBe('onboarding-docs-auditor');
    expect(m.pilares[0]!.skill).toBe('onboarding-docs-audit');
  });

  it('uma linha fora da FORMA da tabela é erro (a leitura por nome desalinharia)', () => {
    const quebrada = md.replace(
      '| 1 | README | `README.md` | arquivo | `## O que é`; `## Documentação` | — | obrigatório | `readme-specialist` | `onboarding-docs-auditor` |',
      '| 1 | README | `README.md` | arquivo | `## O que é` | — | obrigatório | `readme-specialist` |',
    );
    const m = lerMatriz(quebrada);
    expect(m.erros.length).toBeGreaterThan(0);
    expect(m.erros[0]).toContain('células');
  });
});

describe('lacunasDoKit', () => {
  it('kit sadio não acusa nada', () => {
    expect(lacunasDoKit(entradas())).toEqual([]);
  });

  it('doc canônico ausente → erro', () => {
    const e = entradas({ existe: () => false });
    const erros = lacunasDoKit(e);
    expect(erros.some((x) => x.includes('não existe'))).toBe(true);
  });

  it('doc sem a âncora → erro nomeando a âncora', () => {
    const e = entradas({ ler: (c) => (c === 'README.md' ? '# x\n' : '') });
    const erros = lacunasDoKit(e);
    expect(erros.some((x) => x.includes('não tem a âncora "## O que é"'))).toBe(true);
  });

  it('doc vazio → erro', () => {
    const e = entradas({ ler: () => '' });
    expect(lacunasDoKit(e).some((x) => x.includes('está vazio'))).toBe(true);
  });

  it('família: um arquivo sem a âncora reprova e nomeia o arquivo', () => {
    const e = entradas({
      itens: [item({ tipo: 'familia', doc: 'docs/adr/*.md', ancoras: ['## Contexto'] })],
      existe: (c) => c === 'docs/adr/0001.md' || c === 'docs/adr/0002.md',
      ler: (c) => (c === 'docs/adr/0001.md' ? '## Contexto\n' : '## Outra\n'),
      arquivos: (glob) =>
        glob === 'docs/adr/*.md' ? ['docs/adr/0001.md', 'docs/adr/0002.md'] : [],
    });
    const erros = lacunasDoKit(e);
    expect(erros.some((x) => x.includes('docs/adr/0002.md') && x.includes('## Contexto'))).toBe(
      true,
    );
  });

  it('índice que não cita o doc canônico → erro', () => {
    const e = entradas({
      itens: [item({ indice: 'docs/agents/domain.md' })],
      existe: (c) => c === 'docs/agents/domain.md',
      ler: (c) => (c === 'docs/agents/domain.md' ? 'lista outros' : '## O que é\n'),
    });
    expect(lacunasDoKit(e).some((x) => x.includes('não cita "README.md"'))).toBe(true);
  });

  it('specialist que não existe → erro', () => {
    const e = entradas({ agentExiste: (n) => n !== 'readme-specialist' });
    expect(lacunasDoKit(e).some((x) => x.includes('readme-specialist'))).toBe(true);
  });

  it('auditor que não existe → erro', () => {
    const e = entradas({ agentExiste: (n) => n !== 'onboarding-docs-auditor' });
    expect(lacunasDoKit(e).some((x) => x.includes('onboarding-docs-auditor'))).toBe(true);
  });

  it('item repetido na matriz → erro', () => {
    const e = entradas({ itens: [item(), item()] });
    expect(lacunasDoKit(e).some((x) => x.includes('repetido'))).toBe(true);
  });

  it('número repetido na matriz → erro (a coluna `#` é o índice do item)', () => {
    const e = entradas({
      itens: [item({ numero: '1' }), item({ numero: '1', item: 'Outro item' })],
    });
    expect(lacunasDoKit(e).some((x) => x.includes('número "1"'))).toBe(true);
  });

  it('kit sem item → erro (verde por ausência é teatro)', () => {
    expect(lacunasDoKit(entradas({ itens: [] }))[0]).toContain('não tem item nenhum');
  });

  it('pilar que sumiu → erro', () => {
    const e = entradas({ itens: [item({ pilar: 1 })] });
    expect(lacunasDoKit(e).some((x) => x.includes('perdeu o Pilar 4'))).toBe(true);
  });

  it('tipo que o gate não sabe medir → erro', () => {
    const e = entradas({ itens: [item({ tipo: 'nada' as never })] });
    expect(lacunasDoKit(e).some((x) => x.includes('não é um tipo que o gate sabe medir'))).toBe(
      true,
    );
  });

  it('o auditor do item tem que ser o do PILAR dele (a §5.1 é a fonte)', () => {
    const e = entradas({
      itens: [item({ pilar: 1, auditor: 'contract-docs-auditor' })],
    });
    expect(lacunasDoKit(e).some((x) => x.includes('não é o auditor do Pilar 1'))).toBe(true);
  });

  it('a skill de auditoria do pilar tem que existir', () => {
    const e = entradas({ skillExiste: () => false });
    expect(
      lacunasDoKit(e).some((x) => x.includes('a skill de auditoria') && x.includes('não existe')),
    ).toBe(true);
  });

  it('condicional: gatilho disparou e a declaração ficou → a declaração parou de valer', () => {
    const declaracao: DeclaracaoCondicional = {
      item: 'AsyncAPI',
      gatilho: 'existe broker',
      sondas: ['package.json'],
      padrao: '"bullmq"',
      declaracao: 'sim — em 2026-11-18',
      linha: 90,
    };
    const e = entradas({
      itens: [item({ item: 'AsyncAPI', condicao: 'condicional', doc: 'docs/api/asyncapi.yaml' })],
      condicionais: [declaracao],
      sonda: () => 'disparou',
    });
    expect(lacunasDoKit(e).some((x) => x.includes('parou de valer'))).toBe(true);
  });

  it('condicional: gatilho disparou e o doc falta → erro', () => {
    const declaracao: DeclaracaoCondicional = {
      item: 'AsyncAPI',
      gatilho: 'existe broker',
      sondas: ['package.json'],
      padrao: '"bullmq"',
      declaracao: '',
      linha: 90,
    };
    const e = entradas({
      itens: [item({ item: 'AsyncAPI', condicao: 'condicional', doc: 'docs/api/asyncapi.yaml' })],
      condicionais: [declaracao],
      existe: (c) => c !== 'docs/api/asyncapi.yaml',
      sonda: () => 'disparou',
    });
    expect(lacunasDoKit(e).some((x) => x.includes('não existe'))).toBe(true);
  });

  it('condicional: gatilho não disparou e não há declaração → erro', () => {
    const e = entradas({
      itens: [item({ item: 'AsyncAPI', condicao: 'condicional' })],
      condicionais: [
        {
          item: 'AsyncAPI',
          gatilho: 'existe broker',
          sondas: ['package.json'],
          padrao: '"bullmq"',
          declaracao: '',
          linha: 90,
        },
      ],
      sonda: () => 'nao-disparou',
    });
    expect(lacunasDoKit(e).some((x) => x.includes('não-aplicabilidade'))).toBe(true);
  });

  it('condicional: item sem a linha na §4 → erro (o sumiu em silêncio)', () => {
    const e = entradas({
      itens: [item({ item: 'AsyncAPI', condicao: 'condicional' })],
      condicionais: [],
      sonda: () => 'nao-disparou',
    });
    expect(lacunasDoKit(e).some((x) => x.includes('item condicional sem declaração na §4'))).toBe(
      true,
    );
  });

  it('condicional: a sonda que NÃO mede não autoriza a não-aplicabilidade', () => {
    // MEDIDO em 2026-11-18 (revisão do PR do kit): com o `catch` devolvendo
    // `false`, uma regex inválida virava "não disparou" — e o item ficava sem
    // doc PARA SEMPRE, com o gate verde.
    const e = entradas({
      itens: [item({ item: 'AsyncAPI', condicao: 'condicional', doc: 'docs/api/asyncapi.yaml' })],
      sonda: () => 'erro',
      existe: (c) => c !== 'docs/api/asyncapi.yaml',
    });
    const erros = lacunasDoKit(e);
    expect(erros.some((x) => x.includes('a sonda do gatilho NÃO mede'))).toBe(true);
    expect(erros.some((x) => x.includes('não existe'))).toBe(true);
  });

  it('condicional: a §4 dizendo "não" deixa o item OBRIGATÓRIO', () => {
    const e = entradas({
      itens: [item({ item: 'AsyncAPI', condicao: 'condicional', doc: 'docs/api/asyncapi.yaml' })],
      condicionais: [
        {
          item: 'AsyncAPI',
          gatilho: 'existe broker',
          sondas: ['package.json'],
          padrao: '"bullmq"',
          declaracao: '**não** — o item se aplica',
          linha: 90,
        },
      ],
      sonda: () => 'nao-disparou',
      existe: (c) => c !== 'docs/api/asyncapi.yaml',
    });
    const erros = lacunasDoKit(e);
    expect(erros.some((x) => x.includes('não existe'))).toBe(true);
    expect(erros.some((x) => x.includes('diz que o item SE APLICA'))).toBe(true);
  });

  it('condicional: N/A declarada E o doc ausente → o doc NÃO é exigido', () => {
    // O fixture tem o AsyncAPI condicional com a N/A declarada; aqui o doc
    // some. O gate NÃO pode exigir um arquivo que a §4 diz que não existe.
    const e = entradas({
      sonda: () => 'nao-disparou',
      existe: (c) => c !== 'docs/api/asyncapi.yaml',
    });
    expect(lacunasDoKit(e)).toEqual([]);
  });

  it('§4 que declara um item obrigatório → as duas tabelas discordam', () => {
    const e = entradas({
      condicionais: [
        {
          item: 'README (A Vitrine)',
          gatilho: 'x',
          sondas: ['package.json'],
          padrao: 'y',
          declaracao: 'sim',
          linha: 90,
        },
      ],
    });
    expect(lacunasDoKit(e).some((x) => x.includes('as duas tabelas discordam'))).toBe(true);
  });

  it('§4 que declara um item que não existe na matriz → a declaração não exclui nada', () => {
    const e = entradas({
      condicionais: [
        {
          item: 'Inexistente',
          gatilho: 'x',
          sondas: ['package.json'],
          padrao: 'y',
          declaracao: 'sim',
          linha: 90,
        },
      ],
    });
    expect(lacunasDoKit(e).some((x) => x.includes('não é um item da matriz'))).toBe(true);
  });
});

describe('checkDocKit — o repo real', () => {
  it('a convenção do kit existe', () => {
    expect(CONVENCAO).toBe('.agents/specs/conventions/kit-documentacao.md');
  });

  it('o repo real tem os 14 itens do kit cobertos', async () => {
    const r = await checkDocKit({ repoRoot: REPO_REAL });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('o gate mede algo: o advisory diz quantos itens foram medidos', async () => {
    const r = await checkDocKit({ repoRoot: REPO_REAL });
    expect(r.advisories?.join(' ')).toMatch(/14 item\(ns\)/);
  });
});

describe('checkDocKit — o CLI', () => {
  it('sem a convenção, o gate falha em vez de passar calado', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'doc-kit-cli-'));
    try {
      // `spawnSync` e não `execFileSync`: o CLI escreve o relato no **stderr**
      // (`linhasDoRelato`), e o `execFileSync` só devolve o stdout.
      const r = spawnSync(TSX, [SCRIPT], { cwd: tmp, encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('não foi possível ler');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('o CLI sai com 0 e imprime a medição quando o repo está saudável', () => {
    const r = spawnSync(TSX, [SCRIPT], { cwd: REPO_REAL, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/medido:/);
  });
});
