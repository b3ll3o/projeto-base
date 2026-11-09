import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  checkBindingCanonico,
  lerCamposDoFrontmatter,
  camposExigidos,
  type Divergencia,
} from './check-binding-canonico.js';

/**
 * pt-BR (issue #149, F1): o wrapper do binding Claude Code tem que bater com o
 * canônico, **byte a byte**.
 *
 * O `.claude/README.md` promete que o `name` e a `description` do wrapper são
 * "copiados literalmente do frontmatter canônico", e avisa que re-serializar
 * YAML corrompe o `description` — o Claude Code passa a descobrir a skill com
 * o gatilho errado, **sem erro visível**. Nenhum gate media isso.
 *
 * Esta spec tem dois blocos de propósito diferente:
 *
 *   1. as primitivas, com fixtures curtas — para fixar a mecânica (parse do
 *      frontmatter, exigência de campos, comparação byte a byte);
 *   2. o gate contra os **ARQUIVOS REAIS**, que é o teste que a issue exige.
 *
 * ⚠️ A fixture tem que ter a **forma do arquivo real**: frontmatter com
 * `---` na linha 1, campos `chave: valor`, e o corpo depois. Uma fixture de
 * forma diferente passa a medir o fixture, e não o que o gate vê no disco.
 */

const WRAPPER_DE_SKILL = `---
name: probe
description: "Uma skill de teste, com aspas duplas."
type: specialist
version: 1.0
updated: 2026-11-09
---

# Skill \`probe\`

Corpo.
`;

const CANONICO_DE_SKILL = `---
name: probe
description: "Uma skill de teste, com aspas duplas."
type: specialist
version: 1.0
updated: 2026-11-09
---

# Skill \`probe\`

Corpo canônico.
`;

// ── DEF 1 ────────────────────────────────────────────────────────────────────
// A comparação é da LINHA INTEIRA, não do valor parseado. Um `description`
// re-serializado (aspasperdidas, vírgula dentro, aspas simples) tem o mesmo
// valor **semântico** e um byte diferente — e é a re-serialização que o
// `.claude/README.md` proíbe.
describe('lerCamposDoFrontmatter', () => {
  it('lê os campos do frontmatter com o número da linha', () => {
    const campos = lerCamposDoFrontmatter(WRAPPER_DE_SKILL);
    expect(campos.map((c) => c.campo)).toEqual([
      'name',
      'description',
      'type',
      'version',
      'updated',
    ]);
    expect(campos[0]!.linha).toBe(2);
    expect(campos[1]!.linha).toBe(3);
    // A LINHA INTEIRA, com o prefixo da chave — é ela que tem que ser
    // idêntica entre wrapper e canônico.
    expect(campos[1]!.texto).toBe('description: "Uma skill de teste, com aspas duplas."');
  });

  it('NÃO lê campo de fora do frontmatter', () => {
    // O corpo pode ter um `name:` solto; ele não é frontmatter.
    const comCorpo = `---\nname: probe\n---\n\nname: isto-aqui-nao-e-frontmatter\n`;
    const campos = lerCamposDoFrontmatter(comCorpo);
    expect(campos.map((c) => c.campo)).toEqual(['name']);
  });

  it('devolve lista vazia quando não há frontmatter', () => {
    expect(lerCamposDoFrontmatter('# Só corpo\n')).toEqual([]);
  });

  it('NÃO lê frontmatter que NÃO começa na linha 1', () => {
    // Sem a guarda do `---` na primeira linha, um `---` no meio do corpo
    // abriria um "frontmatter" falso e os campos abaixo dele entrariam na
    // comparação. O frontmatter só existe se o arquivo COMEÇA com `---`.
    const comProsaAntes = '# Um título\n\nname: isto-nao-e-frontmatter\n---\n';
    expect(lerCamposDoFrontmatter(comProsaAntes)).toEqual([]);
  });
});

// ── DEF 2 ────────────────────────────────────────────────────────────────────
// Os campos obrigatórios diferem por camada: o wrapper de **skill** não
// carrega `tools` (o `.claude/README.md` diz que `type`, `tools`, `version` e
// `updated` são deliberadamente NÃO copiados), e o wrapper de **agent** tem
// que carregar `tools` — sem ele o subagent herda a pool inteira da conversa,
// que o próprio README chama de "um desvio silencioso".
describe('camposExigidos', () => {
  it('skill exige name e description, e NÃO exige tools', () => {
    expect(camposExigidos('skill')).toEqual(['name', 'description']);
  });

  it('agent exige name, description e tools', () => {
    expect(camposExigidos('agent')).toEqual(['name', 'description', 'tools']);
  });
});

// ── DEF 3 ────────────────────────────────────────────────────────────────────
// O gate contra um PAR de arquivos. As fixtures acima medem a mecânica; aqui
// o par é montado em memória, e a comparação é o que interessa.
describe('checkBindingCanonico — a comparação', () => {
  const montar = (wrapper: string, canonico: string) => {
    const arquivos = new Map<string, string>([
      ['.claude/skills/probe/SKILL.md', wrapper],
      ['.agents/skills/probe/SKILL.md', canonico],
    ]);
    return { repoRoot: '.', arquivos } as never;
  };

  it('wrapper idêntico ao canônico: verde', () => {
    const r = checkBindingCanonico(montar(WRAPPER_DE_SKILL, CANONICO_DE_SKILL));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('description com as aspas perdidas: VERMELHO, com o arquivo e a linha', () => {
    // A re-serialização clássica: o valor é o mesmo, o byte não.
    const reSerializado = WRAPPER_DE_SKILL.replace(
      'description: "Uma skill de teste, com aspas duplas."',
      'description: Uma skill de teste, com aspas duplas.',
    );
    expect(reSerializado).not.toBe(WRAPPER_DE_SKILL);

    const r = checkBindingCanonico(montar(reSerializado, CANONICO_DE_SKILL));
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('.claude/skills/probe/SKILL.md:3');
    expect(r.errors.join('\n')).toContain('.agents/skills/probe/SKILL.md:3');
    expect(r.errors.join('\n')).toContain('description');
  });

  it('valor DIFERENTE (não só re-serializado): VERMELHO', () => {
    const trocado = WRAPPER_DE_SKILL.replace('Uma skill de teste', 'Outra skill');
    const r = checkBindingCanonico(montar(trocado, CANONICO_DE_SKILL));
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('description');
  });

  it('campo obrigatório ausente no wrapper: VERMELHO, nomeando o campo', () => {
    const semDescription = WRAPPER_DE_SKILL.replace(
      'description: "Uma skill de teste, com aspas duplas."\n',
      '',
    );
    const r = checkBindingCanonico(montar(semDescription, CANONICO_DE_SKILL));
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('description');
  });

  it('wrapper sem canônico: VERMELHO, nomeando os dois paths', () => {
    const arquivos = new Map<string, string>([['.claude/skills/probe/SKILL.md', WRAPPER_DE_SKILL]]);
    const r = checkBindingCanonico({ repoRoot: '.', arquivos } as never);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('.claude/skills/probe/SKILL.md');
    expect(r.errors.join('\n')).toContain('.agents/skills/probe/SKILL.md');
  });

  it('campo que o wrapper declara e o canônico NÃO: VERMELHO', () => {
    // O wrapper inventa um campo — e o canônico não tem. Sem esta regra o
    // gate ignorava o campo: ele não é divergência de valor, é um campo
    // que não existe do outro lado.
    const comTools = WRAPPER_DE_SKILL.replace(
      'type: specialist',
      'type: specialist\ntools: Read, Write',
    );
    const semTools = CANONICO_DE_SKILL.replace('type: specialist', 'type: specialist');
    expect(comTools).not.toBe(WRAPPER_DE_SKILL);

    const r = checkBindingCanonico(montar(comTools, semTools));
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('tools');
    expect(r.errors.join('\n')).toContain('.claude/skills/probe/SKILL.md:5');
  });

  it('wrapper de AGENT sem `tools`: VERMELHO (o subagent herdaria a pool toda)', () => {
    const wrapperDeAgent = `---
name: probe
description: Um agent de teste.
type: specialist
---

# Agent \`probe\`
`;
    const canonicoDeAgent = `---
name: probe
description: Um agent de teste.
type: specialist
tools: Read, Glob, Grep, Bash, Agent
---

# Agent \`probe\`
`;
    const arquivos = new Map<string, string>([
      ['.claude/agents/probe.md', wrapperDeAgent],
      ['.agents/agents/probe.md', canonicoDeAgent],
    ]);
    const r = checkBindingCanonico({ repoRoot: '.', arquivos } as never);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('tools');
  });

  it('wrapper de AGENT sem `tools`, e canônico SEM `tools`: VERDE', () => {
    // O canônico não declara `tools` — então o wrapper não tem que declarar.
    // Exigir o campo ali seria uma acusação falsa: o defeito não existe.
    const wrapperDeAgent = `---
name: probe
description: Um agent de teste.
type: specialist
---

# Agent \`probe\`
`;
    const canonicoDeAgent = `---
name: probe
description: Um agent de teste.
type: specialist
---

# Agent \`probe\`
`;
    const arquivos = new Map<string, string>([
      ['.claude/agents/probe.md', wrapperDeAgent],
      ['.agents/agents/probe.md', canonicoDeAgent],
    ]);
    const r = checkBindingCanonico({ repoRoot: '.', arquivos } as never);
    expect(r.errors).toEqual([]);
  });

  it('wrapper de AGENT com `tools` divergente: VERMELHO', () => {
    const wrapperDeAgent = `---
name: probe
description: Um agent de teste.
type: specialist
tools: Read, Write
---

# Agent \`probe\`
`;
    const canonicoDeAgent = `---
name: probe
description: Um agent de teste.
type: specialist
tools: Read, Glob, Grep, Bash, Agent
---

# Agent \`probe\`
`;
    const arquivos = new Map<string, string>([
      ['.claude/agents/probe.md', wrapperDeAgent],
      ['.agents/agents/probe.md', canonicoDeAgent],
    ]);
    const r = checkBindingCanonico({ repoRoot: '.', arquivos } as never);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('tools');
    expect(r.errors.join('\n')).toContain('.claude/agents/probe.md:5');
  });
});

// ── O teste que a #149 exige: contra os ARQUIVOS REAIS ──────────────────────
describe('checkBindingCanonico — os arquivos do repo', () => {
  const CHAVE = '.claude/skills/docker/SKILL.md';

  it('a skill `docker` tem wrapper e canônico', () => {
    expect(existsSync(CHAVE)).toBe(true);
    expect(existsSync('.agents/skills/docker/SKILL.md')).toBe(true);
  });

  it('a description do wrapper `docker` é a MESMA LINHA do canônico', () => {
    // ⚠️ Esta é a divergência que existia em `main` quando o PR #147 trocou
    // "healthchecks via curl" por "healthchecks via node" no canônico e não
    // tocou no wrapper. Nenhum gate acusou — porque nenhum gate comparava
    // conteúdo. A spec fixa a linha inteira, byte a byte.
    const doWrapper = lerCamposDoFrontmatter(readFileSync(CHAVE, 'utf-8')).find(
      (c) => c.campo === 'description',
    );
    const doCanonico = lerCamposDoFrontmatter(
      readFileSync('.agents/skills/docker/SKILL.md', 'utf-8'),
    ).find((c) => c.campo === 'description');
    expect(doWrapper).toBeDefined();
    expect(doCanonico).toBeDefined();
    expect(doWrapper!.texto).toBe(doCanonico!.texto);
  });

  it('o gate contra o repo real está VERDE', () => {
    const r = checkBindingCanonico({ repoRoot: '.' });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('o gate mede o NÚMERO de wrappers — e o número não é zero', () => {
    // Um gate que não mede nada também devolve `ok: true`. O advisory tem que
    // dizer quantos wrappers ele comparou.
    const r = checkBindingCanonico({ repoRoot: '.' });
    expect(r.advisories?.join('\n')).toMatch(/wrapper/);
    const medido = Number(/(\d+) wrapper/.exec(r.advisories?.join('\n') ?? '')?.[1] ?? '0');
    expect(medido).toBeGreaterThan(0);
  });
});

// A forma do tipo, para o compilador não deixar o `Divergencia` virar `any`.
export type { Divergencia };
