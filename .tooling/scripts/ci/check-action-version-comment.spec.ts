/**
 * SEM shebang, de propósito.
 *
 * As regressões do `check-action-version-comment`.
 *
 * A mutação que **provou** que o gate tem dente (MEDIDO 2026-11-09): o
 * DependabotProposed o PR #154 subindo `pnpm/action-setup` para 6.1.1 e
 * deixando o comentario `# v3`. O `check-ci-action-pinning` passou — o SHA
 * está pinado e o formato está certo — e o humano lia "v3" na interface.
 */
import { describe, expect, it } from 'vitest';
import {
  checkActionVersionComment,
  extrairUsos,
  majorDaVersao,
  majorDoComentario,
} from './check-action-version-comment';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

describe('check-action-version-comment — extracao dos usos', () => {
  it('extrai action, sha, comentario e linha', () => {
    const usos = extrairUsos(
      ['      - uses: actions/checkout@' + SHA_A + ' # v7.0.1'].join('\n'),
      'ci.yml',
    );
    expect(usos).toHaveLength(1);
    expect(usos[0]!.action).toBe('actions/checkout');
    expect(usos[0]!.sha).toBe(SHA_A);
    expect(usos[0]!.comentario).toBe('v7.0.1');
    expect(usos[0]!.linha).toBe(1);
  });

  it('ignora action local do repo', () => {
    expect(extrairUsos('      - uses: ./scripts/ci/build.sh', 'ci.yml')).toEqual([]);
  });

  it('ignora imagem docker (a regra dela e digesta, nao SHA de action)', () => {
    expect(extrairUsos('      - uses: docker://alpine:3.20', 'ci.yml')).toEqual([]);
  });

  it('ignora linha sem uses:', () => {
    expect(extrairUsos('      runs: echo ola', 'ci.yml')).toEqual([]);
  });

  it('aceita uso sem comentario — o gate e que decide se a falta e erro', () => {
    const usos = extrairUsos('      - uses: actions/checkout@' + SHA_A, 'ci.yml');
    expect(usos).toHaveLength(1);
    expect(usos[0]!.comentario).toBeUndefined();
  });
});

describe('check-action-version-comment — major do comentario', () => {
  it('extrai a major de v7.0.1', () => {
    expect(majorDoComentario('v7.0.1')).toBe(7);
  });

  it('extrai a major de v3', () => {
    expect(majorDoComentario('v3')).toBe(3);
  });

  it('devolve null para comentario sem numero', () => {
    expect(majorDoComentario('pinado')).toBeNull();
  });

  it('devolve null para comentario ausente', () => {
    expect(majorDoComentario(undefined)).toBeNull();
  });

  it('extrai a major da versao declarada, com ou sem "v"', () => {
    expect(majorDaVersao('v7.0.1')).toBe(7);
    expect(majorDaVersao('7.0.1')).toBe(7);
  });
});

describe('check-action-version-comment — fim a fim, num repo temporario', () => {
  async function repo(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'comment-'));
    await mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    await mkdir(path.join(dir, '.tooling', 'scripts', 'ci'), { recursive: true });
    return dir;
  }

  async function workflow(dir: string, conteudo: string): Promise<void> {
    await writeFile(path.join(dir, '.github', 'workflows', 'ci.yml'), conteudo, 'utf-8');
  }

  async function pins(dir: string, pins: unknown[]): Promise<void> {
    await writeFile(
      path.join(dir, '.tooling', 'scripts', 'ci', 'ci-action-pins.json'),
      JSON.stringify({ pins }, null, 2),
      'utf-8',
    );
  }

  it('passa quando o comentario bate com o pin', async () => {
    const dir = await repo();
    try {
      await workflow(dir, `      - uses: actions/checkout@${SHA_A} # v7.0.1`);
      await pins(dir, [{ action: 'actions/checkout', sha: SHA_A, versao: 'v7.0.1' }]);
      const r = await checkActionVersionComment({ repoRoot: dir });
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('REPROVA quando o comentario mente sobre a major (o caso do PR #154)', async () => {
    const dir = await repo();
    try {
      await workflow(dir, `      - uses: pnpm/action-setup@${SHA_A} # v3`);
      await pins(dir, [{ action: 'pnpm/action-setup', sha: SHA_A, versao: 'v6.1.1' }]);
      const r = await checkActionVersionComment({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('comentário mente');
      // a mensagem tem que dizer as duas majors, senao quem le nao sabe o que corrigir
      expect(r.errors.join('\n')).toContain('v6.1.1');
      expect(r.errors.join('\n')).toContain('v3');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('REPROVA quando o comentario esta ausente', async () => {
    const dir = await repo();
    try {
      await workflow(dir, `      - uses: actions/checkout@${SHA_A}`);
      await pins(dir, [{ action: 'actions/checkout', sha: SHA_A, versao: 'v7.0.1' }]);
      const r = await checkActionVersionComment({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('comentário de versão ausente');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('REPROVA quando a mesma action esta em SHAs diferentes', async () => {
    const dir = await repo();
    try {
      await mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
      await writeFile(
        path.join(dir, '.github', 'workflows', 'ci.yml'),
        `      - uses: actions/checkout@${SHA_A} # v7.0.1`,
        'utf-8',
      );
      await writeFile(
        path.join(dir, '.github', 'workflows', 'release.yml'),
        `      - uses: actions/checkout@${SHA_B} # v7.0.1`,
        'utf-8',
      );
      await pins(dir, [{ action: 'actions/checkout', sha: SHA_A, versao: 'v7.0.1' }]);
      const r = await checkActionVersionComment({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('SHAs diferentes');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('REPROVA quando o SHA do workflow diverge da tabela', async () => {
    const dir = await repo();
    try {
      await workflow(dir, `      - uses: actions/checkout@${SHA_B} # v7.0.1`);
      await pins(dir, [{ action: 'actions/checkout', sha: SHA_A, versao: 'v7.0.1' }]);
      const r = await checkActionVersionComment({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('SHA divergente');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('REPROVA quando uma action nao esta declarada na tabela', async () => {
    const dir = await repo();
    try {
      await workflow(dir, `      - uses: acao/desconhecida@${SHA_A} # v1.0.0`);
      await pins(dir, [{ action: 'actions/checkout', sha: SHA_A, versao: 'v7.0.1' }]);
      const r = await checkActionVersionComment({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('não está declarada');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('REPROVA quando a tabela tem uma action que nao aparece em nenhum workflow', async () => {
    const dir = await repo();
    try {
      await workflow(dir, `      - uses: actions/checkout@${SHA_A} # v7.0.1`);
      await pins(dir, [
        { action: 'actions/checkout', sha: SHA_A, versao: 'v7.0.1' },
        { action: 'actions/cache', sha: SHA_B, versao: 'v4.0.0' },
      ]);
      const r = await checkActionVersionComment({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('pin envelhecido');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skipped, com motivo, quando nao ha workflow', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'comment-vazio-'));
    try {
      const r = await checkActionVersionComment({ repoRoot: dir });
      expect(r.ok).toBe(true);
      expect(r.skipped).toBe(true);
      expect(r.reason).toBeTruthy();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
