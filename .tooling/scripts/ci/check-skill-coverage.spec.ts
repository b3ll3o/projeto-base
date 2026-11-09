import { describe, expect, it } from 'vitest';
import {
  citaNome,
  donoDeclarado,
  lacunasDeRegistro,
  listarSkills,
  nomesCitadosPorLink,
} from './check-skill-coverage';

describe('citaNome', () => {
  it('casa o nome como palavra inteira', () => {
    expect(citaNome('a skill `ui-craft` carrega', 'ui-craft')).toBe(true);
  });

  it('NÃO casa um nome que é PREFIXO de outro (a classe 5 de guard-classes)', () => {
    // Sem fronteira, `ui-craft` casaria dentro de `ui-craft-extra` e o gate
    // acusaria uma skill que não existe.
    expect(citaNome('a skill ui-craft-extra existe', 'ui-craft')).toBe(false);
    expect(citaNome('prisma-audit-superseded', 'prisma-audit')).toBe(false);
  });

  it('NÃO casa um nome que é SUFIXO de outro', () => {
    expect(citaNome('legacy-ui-craft', 'ui-craft')).toBe(false);
  });

  it('o `\\b` do JavaScript NÃO serviria: `-` é fronteira de palavra', () => {
    // `\\bui-craft\\b` casaria dentro de `ui-craft-extra`? Não — mas o
    // motivo real é o inverso: `x-ui-craft` também casaria. O teste
    // trava o comportamento correto, que é o lookaround explícito.
    expect(citaNome('x-ui-craft', 'ui-craft')).toBe(false);
  });

  it('nome vazio nunca casa (senão casaria em qualquer lugar)', () => {
    expect(citaNome('qualquer texto', '')).toBe(false);
  });

  it('escapa metacaracteres de regex no nome', () => {
    expect(citaNome('a skill a+b existe', 'a+b')).toBe(true);
    expect(citaNome('a skill axb existe', 'a+b')).toBe(false);
  });
});

describe('nomesCitadosPorLink', () => {
  it('extrai o nome do caminho do link canônico', () => {
    const texto = 'ver [`.agents/skills/ui-craft/SKILL.md`](./.agents/skills/ui-craft/SKILL.md)';
    expect(nomesCitadosPorLink(texto)).toEqual(['ui-craft']);
  });

  it('NÃO extrai um nome de caminho que não é de skill', () => {
    const texto = 'ver [`.agents/agents/explorer.md`](./.agents/agents/explorer.md)';
    expect(nomesCitadosPorLink(texto)).toEqual([]);
  });

  it('deduplica e ordena (a saída precisa ser estável entre execuções)', () => {
    const texto = [
      '`.agents/skills/motion/SKILL.md`',
      '`.agents/skills/ui-craft/SKILL.md`',
      '`.agents/skills/motion/SKILL.md`',
    ].join('\n');
    expect(nomesCitadosPorLink(texto)).toEqual(['motion', 'ui-craft']);
  });
});

describe('donoDeclarado', () => {
  const agents = new Set(['specialist-router', 'explorer']);

  it('extrai o agent do bloco "Quem invoca"', () => {
    const canonico =
      '> **Quem invoca:** `specialist-router` (quando nenhuma skill cobre).\n>\n> **Quando invocar:** sempre.';
    expect(donoDeclarado(canonico, agents)).toBe('specialist-router');
  });

  it('devolve null quando a skill NÃO declara o cabeçalho', () => {
    expect(donoDeclarado('# Skill\n\nsem bloco', agents)).toBeNull();
  });

  it('devolve null quando o nome citado NÃO é um agent conhecido', () => {
    const canonico = '> **Quem invoca:** `skill-que-nao-e-agent` (coisa).';
    expect(donoDeclarado(canonico, agents)).toBeNull();
  });

  it('o bloco é cortado no parágrafo seguinte (não puxa o resto do arquivo)', () => {
    // Sem o corte, "Quem invoca" capturaria o `explorer` citado mais abaixo
    // — e reconciliaria contra o agent errado.
    const canonico = [
      '> **Quem invoca:** `specialist-router` (para demandas sem skill).',
      '>',
      '> **Quando invocar:** sempre.',
      '',
      '## Corpo',
      '',
      'O `explorer` tambem aparece aqui.',
    ].join('\n');
    expect(donoDeclarado(canonico, agents)).toBe('specialist-router');
  });
});

describe('lacunasDeRegistro', () => {
  const bindings = new Set(['ui-craft', 'graphify']);

  it('a skill completa NÃO gera lacuna', () => {
    const lacunas = lacunasDeRegistro(
      ['ui-craft'],
      'a skill ui-craft está indexada',
      'o agent carrega ui-craft',
      bindings,
    );
    expect(lacunas).toEqual([]);
  });

  it('acusa a skill NÃO INDEXADA', () => {
    const lacunas = lacunasDeRegistro(
      ['ui-craft'],
      'nada aqui',
      'o agent carrega ui-craft',
      bindings,
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['indexada']);
    expect(lacunas[0]?.skill).toBe('ui-craft');
  });

  it('acusa a skill SEM DONO (órfã: ninguém a carrega)', () => {
    const lacunas = lacunasDeRegistro(
      ['ui-craft'],
      'a skill ui-craft está indexada',
      'o agent carrega outra coisa',
      bindings,
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['sem-dono']);
  });

  it('acusa a skill SEM BINDING (invisível para o Claude Code)', () => {
    const lacunas = lacunasDeRegistro(
      ['ui-craft'],
      'a skill ui-craft está indexada',
      'o agent carrega ui-craft',
      new Set(),
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['sem-binding']);
  });

  it('acusa a skill FANTASMA (citada no índice, não existe no disco)', () => {
    const lacunas = lacunasDeRegistro(
      [],
      'ver `.agents/skills/skill-que-nao-existe/SKILL.md`',
      '',
      bindings,
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['fantasma']);
    expect(lacunas[0]?.skill).toBe('skill-que-nao-existe');
  });

  it('acusa a skill RECÍPROCA (declara um dono que não a cita de volta)', () => {
    const lacunas = lacunasDeRegistro(
      ['find-skills'],
      'a skill find-skills está indexada',
      'outro agent carrega outra coisa',
      new Set(['find-skills']),
      new Map([['find-skills', '> **Quem invoca:** `specialist-router` (quando nada cobre).']]),
      new Set(['specialist-router']),
      new Map([['specialist-router', 'o roteador classifica a demanda e nada mais']]),
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['sem-dono', 'reciproca']);
  });

  it('a RECÍPROCA NÃO acusa quando o dono declarado cita a skill', () => {
    const lacunas = lacunasDeRegistro(
      ['find-skills'],
      'a skill find-skills está indexada',
      'o specialist-router carrega find-skills',
      new Set(['find-skills']),
      new Map([['find-skills', '> **Quem invoca:** `specialist-router` (quando nada cobre).']]),
      new Set(['specialist-router']),
      new Map([['specialist-router', 'o specialist-router carrega find-skills']]),
    );
    expect(lacunas).toEqual([]);
  });

  it('a RECÍPROCA checa o DONO DECLARADO, não qualquer citador', () => {
    // Outro agent cita a skill, mas o dono declarado não — o drift continua
    // e a regra tem que accusationar.
    const lacunas = lacunasDeRegistro(
      ['find-skills'],
      'a skill find-skills está indexada',
      'outro agent carrega find-skills',
      new Set(['find-skills']),
      new Map([['find-skills', '> **Quem invoca:** `specialist-router` (quando nada cobre).']]),
      new Set(['specialist-router']),
      new Map([['specialist-router', 'o roteador classifica a demanda e nada mais']]),
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['reciproca']);
  });

  it('a skill citada SÓ pelo nome conta como indexada (o índice lista 20 assim)', () => {
    const lacunas = lacunasDeRegistro(
      ['prisma-audit'],
      'Skills de auditoria (1:1): `prisma-audit`, `openapi-audit`',
      'o agent prisma-db-specialist carrega prisma-audit',
      new Set(['prisma-audit']),
    );
    expect(lacunas).toEqual([]);
  });

  it('a skill citada por LINK conta como indexada', () => {
    const lacunas = lacunasDeRegistro(
      ['graphify'],
      'ver [`.agents/skills/graphify/SKILL.md`](./.agents/skills/graphify/SKILL.md)',
      'o explorer carrega graphify',
      new Set(['graphify']),
    );
    expect(lacunas).toEqual([]);
  });

  it('a ORDEM das mensagens é estável (skill, e dentro dela a ordem das regras)', () => {
    const lacunas = lacunasDeRegistro(['zzz-skill', 'aaa-skill'], 'nada', 'nada', new Set());
    expect(lacunas.map((l) => l.skill)).toEqual([
      'aaa-skill',
      'aaa-skill',
      'aaa-skill',
      'zzz-skill',
      'zzz-skill',
      'zzz-skill',
    ]);
    expect(lacunas.map((l) => l.regra)).toEqual([
      'indexada',
      'sem-dono',
      'sem-binding',
      'indexada',
      'sem-dono',
      'sem-binding',
    ]);
  });

  it('NÃO acusa a skill FANTASMA se ela também existir (o par órfão/fantasma é separado)', () => {
    const lacunas = lacunasDeRegistro(
      ['ui-craft'],
      'ver `.agents/skills/ui-craft/SKILL.md`',
      'o agent carrega ui-craft',
      new Set(['ui-craft']),
    );
    expect(lacunas).toEqual([]);
  });
});

describe('listarSkills', () => {
  it('um diretório sem SKILL.md NÃO é uma skill', async () => {
    const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const raiz = mkdtempSync(join(tmpdir(), 'skills-'));
    try {
      mkdirSync(join(raiz, '.agents', 'skills', 'real'), { recursive: true });
      writeFileSync(join(raiz, '.agents', 'skills', 'real', 'SKILL.md'), '---\nname: real\n---\n');
      mkdirSync(join(raiz, '.agents', 'skills', 'lixo'), { recursive: true });
      const skills = await listarSkills(raiz);
      expect(skills).toEqual(['real']);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it('um diretório INEXISTENTE devolve lista vazia (o gate acusa, mas não quebra)', async () => {
    const skills = await listarSkills('/caminho/que/nao/existe');
    expect(skills).toEqual([]);
  });
});
