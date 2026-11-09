import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SKILLS_DE_AUDITORIA,
  ALVOS_DE_REDIRECT_PERMITIDOS,
  CODIGOS_DE_SUCESSO,
  MARCADOR_DE_FALHA,
  TIMEOUT_POR_PASSO_MS,
  ORCAMENTO_TOTAL_MS,
  checkAuditSkills,
  extrairBlocos,
  linhasDeFalha,
  semComentarios,
  violacoesDoBloco,
  alvosDeRedirect,
  reconciliarExcecoesDeSkip,
  ARQUIVO_DE_EXCECOES_DE_SKIP,
  type RegistroDeExcecoesDeSkip,
} from './check-audit-skills';

/** Um repo mínimo com uma skill de auditoria. */
function repoCom(skills: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'audit-skills-'));
  for (const [nome, conteudo] of Object.entries(skills)) {
    mkdirSync(join(root, '.agents/skills', nome), { recursive: true });
    writeFileSync(join(root, '.agents/skills', nome, 'SKILL.md'), conteudo);
  }
  return root;
}

describe('a lista de skills de auditoria', () => {
  // ⚠️ Este é o teste que impede a reincidência: a lista é o instrumento, e
  // uma lista que alguém encolhe sem querer volta a medir menos.
  it('nomeia as SETE skills de auditoria do repo', () => {
    // A lista é o instrumento que impede uma skill de auditoria nova de entrar
    // no repo sem ser auditada — sem este pino, uma skill nova escaparia.
    // MEDIDO em 2026-10-29: a `documentation-audit` entrou pelo merge do #129
    // depois do inventário da revisão e escapou por 23 de 25 skills.
    expect(SKILLS_DE_AUDITORIA.length).toBe(7);
    expect(SKILLS_DE_AUDITORIA).toContain('prisma-audit');
    expect(SKILLS_DE_AUDITORIA).toContain('openapi-audit');
    expect(SKILLS_DE_AUDITORIA).toContain('otelcol-audit');
    expect(SKILLS_DE_AUDITORIA).toContain('docker-prod-audit');
    expect(SKILLS_DE_AUDITORIA).toContain('release-versioning-audit');
    expect(SKILLS_DE_AUDITORIA).toContain('findings-orchestration');
    expect(SKILLS_DE_AUDITORIA).toContain('documentation-audit');
  });

  it('cada skill da lista tem SKILL.md de verdade', async () => {
    const { readFileSync } = await import('node:fs');
    for (const skill of SKILLS_DE_AUDITORIA) {
      const md = readFileSync(join(process.cwd(), '.agents/skills', skill, 'SKILL.md'), 'utf-8');
      expect(md.length).toBeGreaterThan(100);
    }
  });
});

describe('extrairBlocos()', () => {
  it('acha o bloco bash e a declaração dele', () => {
    const md = [
      '# Skill',
      '',
      '```bash',
      '# le o schema [gate: run — lê o schema]',
      'cat schema.prisma',
      '```',
      '',
      'texto',
      '',
      '```ts',
      'nao conta',
      '```',
    ].join('\n');

    const blocos = extrairBlocos(md, 'x');
    expect(blocos.length).toBe(1);
    expect(blocos[0]!.declaracao).toBe('run');
    expect(blocos[0]!.motivo).toBe('lê o schema');
    expect(blocos[0]!.corpo).toContain('cat schema.prisma');
    expect(blocos[0]!.corpo).toContain('[gate: run');
  });

  it('um bloco sem declaração vem com declaracao null (e o gate trata como erro)', () => {
    const md = ['```bash', 'echo oi', '```'].join('\n');
    const blocos = extrairBlocos(md, 'x');
    expect(blocos[0]!.declaracao).toBeNull();
  });

  it('a declaração `skip` guarda o motivo', () => {
    const md = ['```bash', '# curl x [gate: skip — precisa de rede]', 'curl x', '```'].join('\n');
    const blocos = extrairBlocos(md, 'x');
    expect(blocos[0]!.declaracao).toBe('skip');
    expect(blocos[0]!.motivo).toBe('precisa de rede');
  });
});

describe('semComentarios()', () => {
  // MEDIDO em 2026-10-29: sem isto, o denylist acusava os COMENTÁRIOS dos
  // passos (`ex: curl em distroless` casava como "fala com a rede").
  it('tira as linhas de comentário', () => {
    const entrada = ['# comentário com curl', 'grep x file', '  # outro', 'echo oi'].join('\n');
    expect(semComentarios(entrada)).toBe('grep x file\necho oi');
  });

  it('mantém um # que está dentro de uma string', () => {
    const entrada = 'grep -E "a#b" file';
    expect(semComentarios(entrada)).toBe(entrada);
  });
});

describe('violacoesDoBloco()', () => {
  it('acusa a escrita, a rede e o daemon', () => {
    expect(violacoesDoBloco('rm -rf build')).toContain('apaga arquivo');
    expect(violacoesDoBloco('curl https://x')).toContain('fala com a rede');
    expect(violacoesDoBloco('docker run alpine')).toContain('precisa do daemon do Docker');
    expect(violacoesDoBloco('git fetch --tags')).toContain('mexe no git');
  });

  it('NÃO acusa o que só aparece em comentário', () => {
    expect(violacoesDoBloco('# 4.3 (ex: curl em distroless)')).toEqual([]);
    expect(violacoesDoBloco('# (sem `git fetch`)')).toEqual([]);
    expect(violacoesDoBloco('# Esperado: 1 (footer único). Se >1, finding DRIFT.')).toEqual([]);
  });

  it('permite o redirect para /tmp e /dev/null, e acusa o resto', () => {
    expect(violacoesDoBloco('grep x f > /tmp/a.txt')).toEqual([]);
    expect(violacoesDoBloco('grep x f 2>/dev/null')).toEqual([]);
    const para = violacoesDoBloco('grep x f > saida.txt');
    expect(para.length).toBeGreaterThan(0);
  });

  it('NÃO confunde o `>` de uma comparação com um redirect', () => {
    // MEDIDO em 2026-10-29: o gate acusou o próprio conserto de outro defeito —
    // o ternário `ini=$(( lineno > 10 ? lineno - 10 : 1 ))` era lido como
    // redirect para o arquivo "10".
    expect(violacoesDoBloco('ini=$(( lineno > 10 ? lineno - 10 : 1 ))')).toEqual([]);
    expect(violacoesDoBloco('if (( a > b )); then :; fi')).toEqual([]);
    // mas um redirect de verdade continua sendo acusado
    expect(violacoesDoBloco('echo x > saida.txt').length).toBeGreaterThan(0);
  });

  it('os alvos de redirect são capturados, não inferidos', () => {
    expect(alvosDeRedirect('a > /tmp/x.txt')).toContain('/tmp/x.txt');
    expect(alvosDeRedirect('a > /tmp/x.txt')).not.toContain('1,');
    expect(ALVOS_DE_REDIRECT_PERMITIDOS.some((p) => p.test('/tmp/x.txt'))).toBe(true);
  });
});

describe('linhasDeFalha()', () => {
  it('acha o marcador de falha do repo', () => {
    const saida = ['ok', `${MARCADOR_DE_FALHA} algo errado`, 'mais'].join('\n');
    expect(linhasDeFalha(saida).length).toBe(1);
  });

  it('ignora a linha que só contém a marca no meio', () => {
    expect(linhasDeFalha('texto ✗ no meio')).toEqual([]);
  });
});

describe('o gate, sobre um repo sintético', () => {
  /** Um repo com as SEIS skills da lista, cada uma com um passo declarado. */
  function repoCompleto(declaracao?: string): string {
    const skills: Record<string, string> = {};
    for (const skill of SKILLS_DE_AUDITORIA) {
      skills[skill] =
        declaracao === undefined
          ? ['```bash', '# mede o arquivo [gate: run — mede o arquivo]', 'echo medida', '```'].join(
              '\n',
            )
          : [declaracao, '', '```bash', 'echo medida', '```'].join('\n');
    }
    return repoCom(skills);
  }

  it('passa quando todo passo declarado roda e não reporta falha', () => {
    const root = repoCompleto();
    try {
      const r = checkAuditSkills({ repoRoot: root });
      expect((r.errors ?? []).join('\n')).toBe('');
      expect(r.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('FALHA quando um bloco não está declarado', () => {
    const root = repoCompleto();
    try {
      // A skill `prisma-audit` fica sem a linha de declaração.
      const arquivo = join(root, '.agents/skills/prisma-audit/SKILL.md');
      writeFileSync(arquivo, ['```bash', 'echo medida', '```'].join('\n'));
      const r = checkAuditSkills({ repoRoot: root });
      expect(r.ok).toBe(false);
      expect((r.errors ?? []).join('\n')).toContain('SEM DECLARAÇÃO');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('FALHA quando o passo declara `run` e escreve no repo', () => {
    const root = repoCompleto();
    try {
      const arquivo = join(root, '.agents/skills/prisma-audit/SKILL.md');
      writeFileSync(
        arquivo,
        [
          '```bash',
          '# mede o arquivo [gate: run — mede o arquivo]',
          'echo x > saida.txt',
          '```',
        ].join('\n'),
      );
      const r = checkAuditSkills({ repoRoot: root });
      expect(r.ok).toBe(false);
      expect((r.errors ?? []).join('\n')).toContain('redireciona');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('FALHA quando o passo imprime a marca de falha', () => {
    const root = repoCompleto();
    try {
      const arquivo = join(root, '.agents/skills/prisma-audit/SKILL.md');
      writeFileSync(
        arquivo,
        [
          '```bash',
          '# mede o arquivo [gate: run — mede o arquivo]',
          'echo "✗ achou drift"',
          '```',
        ].join('\n'),
      );
      const r = checkAuditSkills({ repoRoot: root });
      expect(r.ok).toBe(false);
      expect((r.errors ?? []).join('\n')).toContain('REPORTOU falha');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('FALHA quando o passo não produz nenhuma saída (mediu nada)', () => {
    const root = repoCompleto();
    try {
      const arquivo = join(root, '.agents/skills/prisma-audit/SKILL.md');
      writeFileSync(
        arquivo,
        ['```bash', '# mede o arquivo [gate: run — mede o arquivo]', 'true', '```'].join('\n'),
      );
      const r = checkAuditSkills({ repoRoot: root });
      expect(r.ok).toBe(false);
      expect((r.errors ?? []).join('\n')).toContain('NENHUMA saída');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('o gate, sobre o repo real', () => {
  // A medição de verdade: as skills de auditoria do repo, com os passos
  // executados. É este teste que falha quando um passo quebra.
  it('todos os passos declarados `run` rodam e passam', () => {
    const r = checkAuditSkills({ repoRoot: process.cwd() });
    const detalhe = (r.errors ?? []).join('\n');
    expect(detalhe).toBe('');
    expect(r.ok).toBe(true);
  });

  it('todo bloco bash das skills de auditoria está DECLARADO', () => {
    // A lista não pode encolher em silêncio: um passo novo sem declaração
    // é erro, e este teste é o que impede o gate de medir menos.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    for (const skill of SKILLS_DE_AUDITORIA) {
      const md = readFileSync(join(process.cwd(), '.agents/skills', skill, 'SKILL.md'), 'utf-8');
      for (const bloco of extrairBlocos(md, skill)) {
        expect(`${skill}:${bloco.linha} ${bloco.declaracao}`).not.toContain('null');
        expect(bloco.motivo.length).toBeGreaterThanOrEqual(8);
      }
    }
  });
});

// ── Issue #149 (F2): o motivo de cada `skip` tem que continuar valendo ──────
//
// MEDIDO 2026-11-09: 15 blocos `[gate: skip]` em 7 skills, e o motivo de cada
// um era prosa sem instrumento. O gate lia o motivo (medindo o COMPRIMENTO)
// e o descartava: `if (bloco.declaracao === 'skip') continue;`.
//
// A verificação é repo-derivável: a âncora do motivo tem que continuar no
// CORPO do bloco. É o que o repo controla — o ambiente não está no repo, e um
// gate cujo veredito muda de máquina para máquina é o defeito que
// `gate-must-not-depend-on-machine-ambient-state` nomeia.
describe('reconciliarExcecoesDeSkip', () => {
  const BLOCO_SKIP = {
    skill: 'probe',
    linha: 10,
    declaracao: 'skip' as const,
    motivo: 'precisa de `yq`, que não está instalado no CI',
    corpo: 'yq -P ".services.$svc" docker-compose.yml',
  };
  const REGISTRO: RegistroDeExcecoesDeSkip = {
    _comoUsar: [],
    excecoes: [
      {
        skill: 'probe',
        motivo: 'precisa de `yq`',
        verificacao: { tipo: 'no-bloco', padrao: 'yq -P' },
      },
    ],
  };

  it('skip com entrada que casa: verde', () => {
    expect(reconciliarExcecoesDeSkip([BLOCO_SKIP], REGISTRO)).toEqual([]);
  });

  it('skip SEM entrada no registro: erro — dívida silenciosa', () => {
    const errors = reconciliarExcecoesDeSkip([BLOCO_SKIP], { _comoUsar: [], excecoes: [] });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('SEM verificação');
  });

  it('âncora que sumiu do corpo: o motivo PAROU de valer', () => {
    const reescrito = { ...BLOCO_SKIP, corpo: 'docker compose config --services' };
    const errors = reconciliarExcecoesDeSkip([reescrito], REGISTRO);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('PAROU de valer');
  });

  it('entrada que não casa com nenhum bloco: a exceção não exclui mais nada', () => {
    const errors = reconciliarExcecoesDeSkip([], REGISTRO);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('não exclui mais nada');
  });

  it('motivo que mudou no bloco: o registro tem que mudar junto', () => {
    const outroMotivo = { ...BLOCO_SKIP, motivo: 'precisa de rede para o registry' };
    const errors = reconciliarExcecoesDeSkip([outroMotivo], REGISTRO);
    expect(errors.join('\n')).toContain('SEM verificação');
  });

  it('registro ambíguo: duas âncoras casam com o mesmo bloco', () => {
    const ambiguo: RegistroDeExcecoesDeSkip = {
      _comoUsar: [],
      excecoes: [
        {
          skill: 'probe',
          motivo: 'precisa de `yq`',
          verificacao: { tipo: 'no-bloco', padrao: 'yq' },
        },
        {
          skill: 'probe',
          motivo: 'precisa de `yq`',
          verificacao: { tipo: 'no-bloco', padrao: 'yq -P' },
        },
      ],
    };
    const errors = reconciliarExcecoesDeSkip([BLOCO_SKIP], ambiguo);
    expect(errors.join('\n')).toContain('AMBÍGUO');
  });

  it('padrão que não compila é erro do gate — não um crash', () => {
    // `new RegExp('[')` lança. Um gate que morre com stack trace no meio do
    // preflight leva os ~40 gates que rodam depois dele junto — o gate que
    // deveria acusar o registro quebrado é o que derruba a roda.
    const quebrado: RegistroDeExcecoesDeSkip = {
      _comoUsar: [],
      excecoes: [
        {
          skill: 'probe',
          motivo: 'precisa de `yq`',
          verificacao: { tipo: 'no-bloco', padrao: '[' },
        },
      ],
    };
    const errors = reconciliarExcecoesDeSkip([BLOCO_SKIP], quebrado);
    expect(errors.join('\n')).toContain('não é um regex que compila');
  });

  it('a âncora NÃO pode ser o próprio motivo — seria tautologia', () => {
    // Se a âncora fosse o texto do motivo, a verificação casaria com o
    // motivo e não com o comando: ela provaria que o motivo existe, e não
    // que o bloco ainda precisa da coisa que o motivo nomeia.
    const tautologico: RegistroDeExcecoesDeSkip = {
      _comoUsar: [],
      excecoes: [
        {
          skill: 'probe',
          motivo: 'precisa de `yq`',
          verificacao: { tipo: 'no-bloco', padrao: 'precisa de `yq`' },
        },
      ],
    };
    const errors = reconciliarExcecoesDeSkip([BLOCO_SKIP], tautologico);
    expect(errors.join('\n')).toContain('PAROU de valer');
  });

  it('a âncora é testada contra o corpo SEM COMENTÁRIOS', () => {
    // MEDIDO 2026-11-09 (issue #149, revisão do PR #155): o corpo do bloco
    // CONTÉM o comentário do marcador `[gate: skip — ...]`. Testada contra o
    // corpo CRU, a âncora era satisfeita pelo COMENTÁRIO — e apagar o comando
    // do bloco, deixando só um comentário que o citava, deixava o gate
    // VERDE. A verificação provava que o COMENTÁRIO existia.
    const soComentario = {
      ...BLOCO_SKIP,
      corpo: '# yq -P ".services.$svc" docker-compose.yml\n# o passo mede nada sem ele',
    };
    const errors = reconciliarExcecoesDeSkip([soComentario], REGISTRO);
    expect(errors.join('\n')).toContain('PAROU de valer');
  });

  it('uma entrada que casa com DOIS blocos é erro — desambiguação 1:1', () => {
    // MEDIDO 2026-11-09 (issue #149, revisão do PR #155): `usados` era um
    // `Set` de índices, e um `Set` conta a entrada UMA vez — então uma
    // entrada que cobrisse dois blocos passava, e a regra "casa com
    // exatamente um" estava escrita no docstring e no registro de dentes sem
    // estar implementada.
    const doisBlocos = [BLOCO_SKIP, { ...BLOCO_SKIP, linha: 20 }];
    const errors = reconciliarExcecoesDeSkip(doisBlocos, REGISTRO);
    expect(errors.join('\n')).toContain('casa com 2 blocos');
  });
});

// ── O teste que a #149 exige: contra os ARQUIVOS REAIS ──────────────────────
describe('o registro das exceções `skip` — os arquivos do repo', () => {
  it('todo bloco `skip` da repo real tem entrada no registro', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const registro = JSON.parse(
      readFileSync(join(process.cwd(), ARQUIVO_DE_EXCECOES_DE_SKIP), 'utf-8'),
    ) as RegistroDeExcecoesDeSkip;

    const skips: ReturnType<typeof extrairBlocos> = [];
    for (const skill of SKILLS_DE_AUDITORIA) {
      const md = readFileSync(join(process.cwd(), '.agents/skills', skill, 'SKILL.md'), 'utf-8');
      for (const bloco of extrairBlocos(md, skill)) {
        if (bloco.declaracao === 'skip') skips.push(bloco);
      }
    }
    // O número é medido, não conferido: se uma skill nova entrar com `skip`, o
    // registro tem de acompanhar — e este teste é o que fecha a conta.
    expect(skips.length).toBe(15);
    expect(registro.excecoes.length).toBe(skips.length);
    expect(reconciliarExcecoesDeSkip(skips, registro)).toEqual([]);
  });

  it('o gate contra o repo real está VERDE', () => {
    const r = checkAuditSkills({ repoRoot: process.cwd() });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe('o orcamento do gate', () => {
  it('o orcamento total e o passo cabem no job de 5 min da CI', () => {
    // MEDIDO em 2026-10-29: o job de preflight tem `timeout-minutes: 5` e roda
    // com ~40 outros gates. Com 120s por passo e 24 passos, o pior caso era
    // 48 min — 10× o orçamento do job inteiro, e a falha apareceria como "o
    // job estourou o tempo", não como "o passo travou".
    expect(ORCAMENTO_TOTAL_MS).toBeLessThanOrEqual(120_000);
    expect(TIMEOUT_POR_PASSO_MS).toBeLessThan(ORCAMENTO_TOTAL_MS);
  });
});

describe('os limites declarados', () => {
  it('o timeout por passo é generoso o bastante para um grep grande', () => {
    expect(TIMEOUT_POR_PASSO_MS).toBeGreaterThanOrEqual(30_000);
  });

  it('o código 1 (sem match) é sucesso; 2, 126 e 127 são falha', () => {
    expect(CODIGOS_DE_SUCESSO).toContain(0);
    expect(CODIGOS_DE_SUCESSO).toContain(1);
    expect(CODIGOS_DE_SUCESSO).not.toContain(2);
    expect(CODIGOS_DE_SUCESSO).not.toContain(127);
  });
});
