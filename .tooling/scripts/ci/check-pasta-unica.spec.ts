import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PASTAS_DE_VENDOR, checkPastaUnica, lacunasDePasta } from './check-pasta-unica';

describe('lacunasDePasta', () => {
  it('não acusa nada quando não há pasta de vendor e não há path versionado', () => {
    expect(lacunasDePasta([], [])).toEqual([]);
  });

  it('acusa a pasta de vendor que está NO DISCO, nomeando a pasta', () => {
    const lacunas = lacunasDePasta(['.claude'], []);
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]?.regra).toBe('no-disco');
    expect(lacunas[0]?.pasta).toBe('.claude');
    expect(lacunas[0]?.detalhe).toContain('.agents/');
  });

  it('NÃO acusa as pastas dos outros vendors — elas são criadas de propósito, por receita', () => {
    // `docs/integrations/` manda criar `.cursor/commands/` e
    // `.windsurf/memories/` num projeto derivado. Proibi-las aqui reprovaria
    // quem seguiu a receita.
    const lacunas = lacunasDePasta([], ['.cursor/commands/x.md']);
    expect(lacunas).toEqual([]);
  });

  it('acusa o path VERSIONADO, e a mensagem diz como remover', () => {
    const lacunas = lacunasDePasta([], ['.claude/skills/x/SKILL.md']);
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]?.regra).toBe('versionada');
    expect(lacunas[0]?.detalhe).toContain('.claude/skills/x/SKILL.md');
    expect(lacunas[0]?.detalhe).toContain('git rm --cached');
  });

  it('NÃO acusa path versionado FORA das pastas de vendor (`.github/` é do GitHub)', () => {
    const lacunas = lacunasDePasta([], ['.github/workflows/ci.yml', 'docs/x.md']);
    expect(lacunas).toEqual([]);
  });

  it('quando o git não pôde ser lido, a regra VERSIONADA não é exercitada — e a NO DISCO continua', () => {
    const lacunas = lacunasDePasta(['.cursor'], null);
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]?.regra).toBe('no-disco');
    expect(lacunas[0]?.pasta).toBe('.cursor');
  });

  it('a ORDEM das mensagens é estável: NO DISCO antes de VERSIONADA', () => {
    const lacunas = lacunasDePasta(['.claude'], ['.claude/a.md']);
    expect(lacunas.map((l) => l.regra)).toEqual(['no-disco', 'versionada']);
  });
});

describe('checkPastaUnica', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'check-pasta-unica-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function git(...args: string[]) {
    execFileSync('git', args, { cwd: tmp, stdio: 'ignore' });
  }

  function initGit() {
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
  }

  it('verde quando o repo tem só `.agents/`', async () => {
    mkdirSync(join(tmp, '.agents', 'skills'), { recursive: true });
    writeFileSync(join(tmp, '.agents', 'skills', 'x.md'), 'ok');
    const r = await checkPastaUnica({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('VERMELHO quando `.claude/` aparece na árvore de trabalho', async () => {
    mkdirSync(join(tmp, '.claude', 'skills'), { recursive: true });
    writeFileSync(join(tmp, '.claude', 'skills', 'x.md'), 'ok');
    const r = await checkPastaUnica({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('.claude');
    expect(r.errors[0]).toContain('no-disco');
  });

  it('VERMELHO quando `.claude/` é um SYMLINK — `lstat`, não `stat`', async () => {
    // Um symlink apontando para fora do repo é a pasta de vendor aparecendo
    // do mesmo jeito; `stat` seguiria o link e mediria o destino.
    mkdirSync(join(tmp, 'destino'), { recursive: true });
    symlinkSync(join(tmp, 'destino'), join(tmp, '.claude'));
    const r = await checkPastaUnica({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('.claude');
  });

  it('VERDE quando `.claude/` só tem o `settings.local.json` (permissão local)', async () => {
    // O Claude Code grava esse arquivo no projeto quando o usuário aprova uma
    // permissão. Ele é estado da máquina, não uma cópia da árvore canônica —
    // reprovar ele deixaria o pre-push vermelho de quem usa o Claude Code.
    mkdirSync(join(tmp, '.claude'), { recursive: true });
    writeFileSync(join(tmp, '.claude', 'settings.local.json'), '{}');
    const r = await checkPastaUnica({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('VERMELHO quando `.claude/` tem o `settings.local.json` E outra coisa', async () => {
    mkdirSync(join(tmp, '.claude', 'skills'), { recursive: true });
    writeFileSync(join(tmp, '.claude', 'settings.local.json'), '{}');
    writeFileSync(join(tmp, '.claude', 'skills', 'x.md'), 'ok');
    const r = await checkPastaUnica({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('no-disco');
  });

  it('mede a raiz do repo, não o diretório de onde foi chamado', async () => {
    initGit();
    mkdirSync(join(tmp, 'sub', 'dir'), { recursive: true });
    mkdirSync(join(tmp, '.claude'), { recursive: true });
    writeFileSync(join(tmp, '.claude', 'skills.md'), 'ok');
    git('add', '-A');
    // Chamado de um SUBDIRECTÓRIO: `git ls-files` sem `--show-toplevel`
    // listaria só a subárvore, e o gate ficaria mudo.
    const r = await checkPastaUnica({ repoRoot: join(tmp, 'sub', 'dir') });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('.claude');
  });

  it('VERMELHO quando um path de vendor está no índice do git', async () => {
    initGit();
    mkdirSync(join(tmp, '.claude'), { recursive: true });
    writeFileSync(join(tmp, '.claude', 'settings.json'), '{}');
    git('add', '-A');
    rmSync(join(tmp, '.claude'), { recursive: true, force: true });
    // A pasta saiu do disco, mas o índice ainda a carrega: é o commit que
    // publicaria arquivos que ninguém editou.
    const r = await checkPastaUnica({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('versionada');
    expect(r.errors[0]).toContain('.claude/settings.json');
  });

  it('VERMELHO quando o path de vendor está versionado E no disco (as duas regras)', async () => {
    initGit();
    mkdirSync(join(tmp, '.claude'), { recursive: true });
    writeFileSync(join(tmp, '.claude', 'settings.json'), '{}');
    git('add', '-A');
    const r = await checkPastaUnica({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(2);
    expect(r.errors.map((e) => (e.includes('no-disco') ? 'no-disco' : 'versionada'))).toEqual([
      'no-disco',
      'versionada',
    ]);
  });

  it('NÃO acusa a pasta `.github/` — ela é do GitHub, não de uma tool de IA', async () => {
    initGit();
    mkdirSync(join(tmp, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(tmp, '.github', 'workflows', 'ci.yml'), 'name: ci');
    git('add', '-A');
    const r = await checkPastaUnica({ repoRoot: tmp });
    expect(r.ok).toBe(true);
  });

  it('sem git, a regra VERSIONADA fica declarada como não medida (advisory), sem virar verde por ausência', async () => {
    // tmpdir fora de um repo git: `git ls-files` falha. O gate não pode
    // transformar "não medi" em "não há defeito" — a ressalva vai explícita.
    const r = await checkPastaUnica({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect(r.advisories?.[0]).toContain('índice do git');
  });

  it('o repo REAL passa — a árvore de trabalho não tem pasta de vendor', async () => {
    const r = await checkPastaUnica({ repoRoot: process.cwd() });
    expect(r.errors).toEqual([]);
  });

  it('a lista de pastas de vendor cobre o `.claude/` e NÃO cobre o `.github/`', () => {
    expect(PASTAS_DE_VENDOR).toContain('.claude');
    expect(PASTAS_DE_VENDOR).not.toContain('.github');
  });

  it('a lista NÃO inclui as pastas dos outros vendors (criadas de propósito, por receita)', () => {
    for (const pasta of ['.cursor', '.windsurf', '.continue', '.cline', '.aider', '.cody']) {
      expect(PASTAS_DE_VENDOR).not.toContain(pasta);
    }
  });
});
