import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARQUIVO_DE_EXCECOES,
  carregarExcecoes,
  checkDependencyAudit,
  extrairAdvisories,
  auditoriaDeErro,
  SEVERIDADES_QUE_REPROVAM,
  verificarExcecao,
  type ArquivoDeExcecoes,
  type Excecao,
} from './check-dependency-audit';

/** A raiz do repo — o vitest roda com o cwd na raiz (o `--root` é da suite). */
const REPO = process.cwd();

/** Um repo mínimo, com a lista de exceções versionada. */
function repoCom(lista: ArquivoDeExcecoes): string {
  const root = mkdtempSync(join(tmpdir(), 'dep-audit-'));
  mkdirSync(join(root, '.tooling/scripts/ci'), { recursive: true });
  writeFileSync(join(root, ARQUIVO_DE_EXCECOES), JSON.stringify(lista, null, 2), 'utf-8');
  return root;
}

/** Um `pnpm audit --json` sintético, no formato real (o id é a chave). */
function auditoriaFake(
  advisories: Record<string, Record<string, unknown>>,
  vulnerabilities: Record<string, number> = {},
): string {
  return JSON.stringify({ advisories, metadata: { vulnerabilities } });
}

const ADVISORY_CRITICA = {
  module_name: 'next',
  severity: 'critical',
  title: 'RCE na otimização de imagem',
  vulnerable_versions: '>=10.0.0 <=15.5.27',
  patched_versions: '>=15.5.28',
  findings: [{ versions: ['15.5.25'], paths: ['apps/web > next@15.5.25'] }],
};

const ADVISORY_MODERADA = {
  module_name: 'algo',
  severity: 'moderate',
  title: 'algo moderado',
  vulnerable_versions: '<1.0.0',
  patched_versions: '>=1.0.0',
  findings: [{ versions: ['0.9.0'], paths: ['x > algo@0.9.0'] }],
};

/** A exceção do vitest, que existe de verdade na lista versionada. */
function excecaoDoVitest(): Excecao {
  return {
    id: '1139528',
    modulo: 'vitest',
    severidade: 'critical',
    motivo: 'o UI server nunca é iniciado',
    verificacao: {
      tipo: 'ausencia',
      padrao: 'NadaDissoExisteEm lugar nenhum',
      caminhos: ['apps'],
    },
  };
}

describe('a extração das advisories', () => {
  it('o id da advisory é a CHAVE do objeto (o pnpm não tem campo "id")', () => {
    // MEDIDO em 2026-11-03: o `pnpm audit --json` traz
    // `{ advisories: { <id>: {...} } }` — o id é a chave. Ler `advisory.id`
    // daria undefined e nenhuma advisory casaria com a lista de exceções.
    const achadas = extrairAdvisories(auditoriaFake({ '1242817': ADVISORY_CRITICA }));
    expect(achadas).toHaveLength(1);
    expect(achadas[0]!.id).toBe('1242817');
    expect(achadas[0]!.modulo).toBe('next');
    expect(achadas[0]!.severidade).toBe('critical');
    expect(achadas[0]!.versoesAfetadas).toEqual(['15.5.25']);
  });

  it('JSON inválido não derruba o gate', () => {
    expect(extrairAdvisories('isto nao e json')).toEqual([]);
  });

  it('o `pnpm audit` sai com código 1 quando acha advisory — e o JSON vem na exceção', () => {
    // MEDIDO em 2026-11-03: o primeiro teste do gate no repo real disse "a
    // auditoria NÃO RODOU" com 4 advisories encontradas. O `pnpm audit` sai
    // com código 1 quando ENCONTRA vulnerabilidade, e o `execFileSync` joga o
    // stdout dentro da exceção.
    const auditoria = auditoriaFake({ '1242817': ADVISORY_CRITICA });
    const erro = Object.assign(new Error('Command failed: pnpm audit --json'), {
      stdout: auditoria,
    });
    expect(auditoriaDeErro(erro)).toBe(auditoria);
    expect(extrairAdvisories(auditoriaDeErro(erro)!)[0]!.id).toBe('1242817');
  });

  it('uma falha SEM JSON é "não rodou", não "não achou advisory"', () => {
    expect(auditoriaDeErro(new Error('sem rede'))).toBeNull();
    expect(auditoriaDeErro({ stdout: 'nao e json' })).toBeNull();
  });
});

describe('o gate, com auditoria sintética', () => {
  it('FALHA quando há advisory crítica sem exceção declarada', () => {
    const root = repoCom({ excecoes: [] });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({ '1242817': ADVISORY_CRITICA }),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/1242817/);
    expect(r.errors.join('\n')).toMatch(/next/);
  });

  it('PASSA quando a advisory moderada está lá (só crítica e alta reprovam)', () => {
    const root = repoCom({ excecoes: [] });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({ '1111111': ADVISORY_MODERADA }),
    });
    expect(r.ok).toBe(true);
  });

  it('PASSA quando a crítica tem exceção declarada E a verificação ainda vale', () => {
    const root = repoCom({ excecoes: [excecaoDoVitest()] });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({
        '1139528': { ...ADVISORY_CRITICA, module_name: 'vitest' },
      }),
    });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('FALHA quando a exceção existe mas a verificação parou de valer', () => {
    // A verificação de uma exceção é a AUSÊNCIA de um padrão. Quando o padrão
    // aparece, o motivo medido deixou de ser verdade — e a exceção é
    // reprovada. É o que impede a exceção de virar dívida silenciosa.
    const root = repoCom({ excecoes: [] });
    mkdirSync(join(root, 'apps'), { recursive: true });
    writeFileSync(
      join(root, 'apps/arquivo.ts'),
      'const x = 1; // NadaDissoExisteEm lugar nenhum\n',
    );
    const excecao = excecaoDoVitest();
    const problema = verificarExcecao(root, excecao);
    expect(problema).not.toBeNull();
    expect(problema).toMatch(/parou de valer/);
  });

  it('FALHA quando a exceção declara uma severidade que não é a da advisory', () => {
    // MEDIDO em 2026-11-03 (revisão do PR #143): os campos `severidade` e
    // `modulo` da exceção eram DECORATIVOS — o gate usava a severidade da
    // advisory e ignorava a declarada. Quem mudasse "critical" para "low"
    // no arquivo acharia que rebaixou a exceção; não rebaixou nada.
    const excecao = excecaoDoVitest();
    const root = repoCom({
      excecoes: [{ ...excecao, severidade: 'low' }],
    });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({
        '1139528': { ...ADVISORY_CRITICA, module_name: 'vitest', severity: 'critical' },
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/severidade "low"/);
  });

  it('FALHA quando a exceção declara um módulo que não é o da advisory', () => {
    const excecao = excecaoDoVitest();
    const root = repoCom({
      excecoes: [{ ...excecao, modulo: 'outro-pacote' }],
    });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({
        '1139528': { ...ADVISORY_CRITICA, module_name: 'vitest', severity: 'critical' },
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/módulo "outro-pacote"/);
  });

  it('AVISA quando uma exceção da lista não casa com nenhuma advisory', () => {
    // A lista não pode encolher nem sobrar em silêncio.
    const root = repoCom({ excecoes: [excecaoDoVitest()] });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({ '1111111': ADVISORY_MODERADA }),
    });
    expect(r.ok).toBe(true);
    expect(r.advisories.join('\n')).toMatch(/não casa com nenhuma advisory/);
  });
});

describe('a claim de advisories — o total declarado contra o medido', () => {
  // MEDIDO 2026-11-10: a prosa do arquivo de exceções afirmava 41 advisories
  // e o `pnpm audit` media 31. O número é uma MEDIÇÃO, e a medição envelhece
  // com o lockfile — o PR #163 corrigia a prosa e registrava que "o gate NÃO
  // o confere". Aqui o gate passa a conferir: o arquivo declara o número, e
  // quem deixa o número envelhecer tem que ser acuado.
  const DECLARADO = {
    medidoEm: '2026-11-09',
    total: 31,
    critical: 1,
    high: 3,
    moderate: 26,
    low: 1,
    info: 0,
  };

  it('FALHA quando o arquivo declara MAIS advisories do que o audit mede', () => {
    // A claim que mente: o arquivo afirma 41 e o audit mede 31.
    const root = repoCom({
      excecoes: [],
      advisoriesEsperadas: { ...DECLARADO, total: 41, moderate: 32, low: 5 },
    });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({}, { critical: 1, high: 3, moderate: 26, low: 1 }),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/declara/);
    expect(r.errors.join('\n')).toMatch(/moderate/);
  });

  it('FALHA quando o TOTAL declarado nao bate com o recorte do proprio campo', () => {
    // A única forma de exercitar o total: as severidades batem com o medido
    // e o total mente. Sem esta spec, apagar a conferência do total deixaria
    // a suíte verde — MEDIDO 2026-11-10.
    const root = repoCom({
      excecoes: [],
      advisoriesEsperadas: { ...DECLARADO, total: 41 },
    });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({}, { critical: 1, high: 3, moderate: 26, low: 1 }),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/incoerente/);
  });

  it('AVISA (sem reprovar) quando o audit mede MAIS advisories do que o arquivo declara', () => {
    // O registro publicou advisory nova: isso NÃO é mudança do repo, e um
    // gate que reprova por causa de dado externo é vermelho sem motivo.
    const root = repoCom({ excecoes: [], advisoriesEsperadas: DECLARADO });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({}, { critical: 1, high: 3, moderate: 30, low: 1 }),
    });
    expect(r.ok).toBe(true);
    expect(r.advisories.join('\n')).toMatch(/moderat/);
  });

  it('PASSA quando o declarado bate com o medido', () => {
    const root = repoCom({ excecoes: [], advisoriesEsperadas: DECLARADO });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({}, { critical: 1, high: 3, moderate: 26, low: 1 }),
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('FALHA quando a claim esta incompleta (um numero que falta)', () => {
    // MEDIDO 2026-11-10: uma claim sem `moderate` (e sem `total`) passava com
    // `ok=true`, 0 erros e 0 avisos — o campo ausente desligava a comparação
    // DAQUELE campo em silêncio. A regra mora no gate; dado incompleto é erro.
    const incompleta = { ...DECLARADO, moderate: undefined } as unknown as typeof DECLARADO;
    const root = repoCom({ excecoes: [], advisoriesEsperadas: incompleta });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({}, { critical: 1, high: 3, moderate: 26, low: 1 }),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/incompleta/);
    expect(r.errors.join('\n')).toMatch(/moderate/);
  });

  it('NAO acusa quando a auditoria nao traz contagem (objeto vazio = sem dado medido)', () => {
    // MEDIDO 2026-11-10: `metadata.vulnerabilities: {}` devolvia um objeto
    // vazio (e não `null`), e o gate acusava 5 erros falsos ("declara 31
    // advisory(ies) e o audit mede 0"). Objeto vazio é "sem dado", não "zero".
    const root = repoCom({ excecoes: [], advisoriesEsperadas: DECLARADO });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: auditoriaFake({}),
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('NAO acusa e DECLARA que a claim nao foi conferida quando o campo falta', () => {
    // Verde por ignorância é a classe 5 do `guard-classes.md`: sem dado
    // medido, o gate tem que dizer que não mediu.
    const root = repoCom({ excecoes: [], advisoriesEsperadas: DECLARADO });
    const r = checkDependencyAudit({
      repoRoot: root,
      auditoriaJson: JSON.stringify({ advisories: {} }),
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.advisories.join('\n')).toMatch(/NÃO foi conferida/);
  });

  it('o arquivo do repo DECLARA a claim — o instrumento não pode ser desligado em silêncio', () => {
    const lista = carregarExcecoes(REPO);
    expect(lista.advisoriesEsperadas).toBeDefined();
    expect(lista.advisoriesEsperadas!.total).toBeGreaterThan(0);
    expect(lista.advisoriesEsperadas!.medidoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('a PROSA do repo cita o mesmo número que a claim declara', () => {
    // O número tem UM dono: o campo `advisoriesEsperadas`. A prosa é o que o
    // humano lê, e ela não pode dizer uma coisa enquanto o campo diz outra —
    // foi exatamente esse o defeito que a issue #149 (F5) mediu: a prosa
    // afirmava 41 e o audit media 31.
    //
    // A âncora é o NÚMERO ao lado da palavra, e não a frase montada: a prosa
    // pode ser reescrita ("1 crítica e 3 altas") sem que a spec precise
    // mudar, e a spec ainda acusa quando o número sai do lugar.
    const lista = carregarExcecoes(REPO);
    const campo = lista.advisoriesEsperadas!;
    const cru = readFileSync(join(REPO, ARQUIVO_DE_EXCECOES), 'utf-8');
    expect(cru).toMatch(new RegExp(`\\b${campo.total} advisories\\b`));
    const severidades: Array<[number, string]> = [
      [campo.critical, 'crítica'],
      [campo.high, 'alta'],
      [campo.moderate, 'moderada'],
      [campo.low, 'baixa'],
    ];
    for (const [n, palavra] of severidades) {
      expect(cru).toMatch(new RegExp(`\\b${n} ${palavra}s?\\b`));
    }
    expect(cru).toContain(campo.medidoEm);
  });
});

describe('a lista de exceções versionada (o repo real)', () => {
  it('a lista existe no caminho declarado pelo gate', () => {
    const lista = carregarExcecoes(REPO);
    expect(lista.excecoes.length).toBeGreaterThan(0);
    expect(ARQUIVO_DE_EXCECOES).toBe('.tooling/scripts/ci/excecoes-de-dependencias.json');
  });

  it('toda exceção declara motivo (com data) e verificação', () => {
    const lista = carregarExcecoes(REPO);
    for (const e of lista.excecoes) {
      expect(e.motivo.length).toBeGreaterThan(40);
      expect(e.motivo).toMatch(/MEDIDO/);
      expect(e.verificacao.tipo).toBe('ausencia');
      expect(e.verificacao.caminhos.length).toBeGreaterThan(0);
    }
  });

  it('a verificação do zod olha o web INTEIRO (não só `app/`)', () => {
    // MEDIDO em 2026-11-03 (revisão do PR #143): a verificação cobria
    // `apps/web/app` — e `apps/web/src`, `apps/web/lib` e
    // `apps/web/components` ficavam de fora. Um `z.array(` em qualquer um
    // deles escapava da verificação, e a exceção continuaria valendo com a
    // exposição de verdade.
    const lista = carregarExcecoes(REPO);
    const zod = lista.excecoes.find((e) => e.modulo === 'zod');
    expect(zod).toBeDefined();
    expect(zod!.verificacao.caminhos).toContain('apps/web');
    expect(zod!.verificacao.caminhos).not.toContain('apps/web/app');
  });

  it('as verificações das exceções VALEM hoje no repo real', () => {
    // A afirmação é o contrário da exceção: o motivo continua valendo.
    const lista = carregarExcecoes(REPO);
    for (const e of lista.excecoes) {
      expect(verificarExcecao(REPO, e)).toBeNull();
    }
  });

  it('a severidade que reprova mora no CÓDIGO — o arquivo de dados não pode enfraquecer o gate', () => {
    // MEDIDO em 2026-11-03 (revisão do PR #143): a lista vinha do JSON, e
    // quem editasse o arquivo trocando `["critical", "high"]` por `[]`
    // zerava a reprovação. A regra mora no gate; o arquivo é só DADO.
    expect(SEVERIDADES_QUE_REPROVAM).toContain('critical');
    expect(SEVERIDADES_QUE_REPROVAM).toContain('high');
    const cru = readFileSync(join(REPO, ARQUIVO_DE_EXCECOES), 'utf-8');
    expect(cru).not.toMatch(/severidadesQueReprovam/);
  });

  it('o arquivo é JSON válido e tem a forma declarada', () => {
    const cru = readFileSync(join(REPO, ARQUIVO_DE_EXCECOES), 'utf-8');
    const lista = JSON.parse(cru) as ArquivoDeExcecoes;
    for (const e of lista.excecoes) {
      expect(e.id).toMatch(/^\d+$/);
      expect(e.modulo.length).toBeGreaterThan(0);
    }
  });
});
