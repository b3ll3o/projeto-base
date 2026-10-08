// tooling/scripts/lint-review-routing.spec.ts
//
// pt-BR: Testes do lint da matriz de roteamento. Cobre `lintMatrix()`
// que valida estrutura YAML, refs de reviewers, regex de diff_patterns,
// e limites de LOC da convenção markdown.

import { describe, it, expect } from 'vitest';
import { lintMatrix } from './lint-review-routing.js';

describe('lintMatrix()', () => {
  it('passes for valid matrix', () => {
    const valid = `
\`\`\`yaml
path_globs:
  - pattern: "apps/api/**"
    reviewers: [nestjs-specialist]
\`\`\`
`;
    const result = lintMatrix(valid);
    expect(result.errors).toEqual([]);
  });

  it('reports error for malformed YAML', () => {
    const md = `\`\`\`yaml\npath_globs:\n  - pattern: [invalid\n\`\`\``;
    const result = lintMatrix(md);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/yaml/i);
  });

  it('warns when referenced reviewer does not exist', () => {
    const md = `\`\`\`yaml\npath_globs:\n  - pattern: "x"\n    reviewers: [non-existent-agent]\n\`\`\``;
    const result = lintMatrix(md, ['existing-agent']);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/non-existent-agent/);
  });

  it('rejects duplicate pattern definitions', () => {
    const md = `
\`\`\`yaml
path_globs:
  - pattern: "apps/api/**"
    reviewers: [a]
  - pattern: "apps/api/**"
    reviewers: [b]
\`\`\``;
    const result = lintMatrix(md);
    expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('checks LOC limit (max 300 lines)', () => {
    const md = 'x\n'.repeat(350);
    const result = lintMatrix(md);
    expect(result.errors.some((e) => e.includes('LOC'))).toBe(true);
  });

  it('reports error for invalid regex in diff_patterns', () => {
    const md = `\`\`\`yaml
diff_patterns:
  - regex: "[invalid-regex("
    reviewers_added: [nestjs-specialist]
\`\`\``;
    const result = lintMatrix(md);
    expect(result.errors.some((e) => e.includes('invalid regex'))).toBe(true);
  });

  it('reports error when YAML blocks present but all invalid', () => {
    const md = `\`\`\`yaml
this is: [not valid yaml at all
\`\`\``;
    const result = lintMatrix(md);
    // MEDIDO 2026-10-08: a mensagem literal 'YAML blocks present' saiu junto com
    // o guard que a produzia — o erro agora nomeia o bloco e diz o que ele
    // perdeu. O que este teste protege é "todo bloco inválido vira erro
    // nomeado", não uma redação.
    expect(result.errors.some((e) => /bloco yaml #1 inválido/.test(e))).toBe(true);
  });

  it('passes LOC at exactly 300 lines', () => {
    // 300 linhas sem \n trailing (split('\n') deve dar exatamente 300 elementos).
    // 'x\n'.repeat(300) terminaria em \n → split daria 301 (off-by-one); usamos
    // 299 'x\n' + 'x' final para fechar exatamente 300 linhas.
    const md = 'x\n'.repeat(299) + 'x';
    const result = lintMatrix(md);
    expect(result.errors.some((e) => e.includes('LOC'))).toBe(false);
  });

  it('fails LOC at 301 lines', () => {
    const md = 'x\n'.repeat(301);
    const result = lintMatrix(md);
    expect(result.errors.some((e) => e.includes('LOC'))).toBe(true);
  });
});

// pt-BR: WARNING — o teste abaixo ("warns when blocking: true glob matches
// only .gitignored paths") depende de `dist/` estar listado em `.gitignore`
// do repo. Se o `.gitignore` for modificado para un-ignore `dist/`, o teste
// vai PASSAR mas exercitará um path diferente (não-gitignored em vez de
// gitignored) — o assertion é permissivo o suficiente para ambos os casos,
// então o teste deixa de ser meaningful sem sinalizar falha.
//
// Para tornar este teste hermético, seria necessário mockar `execSync` (ou
// injetar `getTrackedFiles`/`isPathGitignored` como dependências). Fora de
// escopo deste PR; documentado para futuro hardening.
describe('lintMatrix() — path_globs blocking on illegible files (gap P2 #5)', () => {
  it('warns when blocking: true glob matches no files in repo', () => {
    const md = `
\`\`\`yaml
path_globs:
  - pattern: ".agents/nonexistent-dir-xyz123/**"
    reviewers: [doc-sync]
    blocking: true
\`\`\``;
    const result = lintMatrix(md, ['doc-sync']);
    expect(result.warnings.some((w) => w.match(/no files matched|ilegível|illegible/i))).toBe(true);
  });

  it('warns when blocking: true glob matches only .gitignored paths', () => {
    // .gitignore tem: dist/, .turbo/, node_modules/, coverage/.
    const md = `
\`\`\`yaml
path_globs:
  - pattern: "dist/**"
    reviewers: [monorepo-specialist]
    blocking: true
\`\`\``;
    const result = lintMatrix(md, ['monorepo-specialist']);
    expect(result.warnings.some((w) => w.match(/gitignore|ilegível|illegible/i))).toBe(true);
  });

  it('does NOT warn when blocking: true glob matches existing, non-ignored files', () => {
    const md = `
\`\`\`yaml
path_globs:
  - pattern: "package.json"
    reviewers: [monorepo-specialist]
    blocking: true
\`\`\``;
    const result = lintMatrix(md, ['monorepo-specialist']);
    expect(result.warnings.some((w) => w.match(/ilegível|illegible|gitignore/i))).toBe(false);
  });

  it('does NOT warn when blocking: false (no severity escalation)', () => {
    const md = `
\`\`\`yaml
path_globs:
  - pattern: ".agents/nonexistent-dir-xyz123/**"
    reviewers: [doc-sync]
    blocking: false
\`\`\``;
    const result = lintMatrix(md, ['doc-sync']);
    expect(result.warnings.some((w) => w.match(/ilegível|illegible|gitignore/i))).toBe(false);
  });
});

// MEDIDO 2026-10-08: `loadMatrix` engole o erro de YAML por bloco
// (`review-router.ts:309`, `catch { continue }`) e devolve a matriz. O lint só
// reclamava quando a matriz ficava **vazia** — mas `Object.assign({}, ['a'])`
// devolve `{0: 'a'}`, que NÃO está vazia. Resultado medido: um bloco ```yaml
// que é lista, escalar ou prosa sai **verde com zero regras verificadas**.
// É verde por ausência: o gate não falhou, ele mediu nada e disse que passou.
describe('lintMatrix() — bloco yaml que não é mapa', () => {
  const fence = (corpo: string) => '```yaml\n' + corpo + '\n```\n';

  it('ERRO quando o bloco yaml é uma LISTA (o gate hoje fica verde e não verifica nada)', () => {
    const result = lintMatrix(fence('- pattern: "apps/api/**"\n- pattern: "apps/web/**"'));
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/não (é|e) um mapa|nao (e|é) um mapa/i);
  });

  it('ERRO quando o bloco yaml é um ESCALAR — prosa dentro do fence é a forma mais provável', () => {
    const result = lintMatrix(fence('Revisar esta matriz antes de mergear.'));
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('ERRO quando o bloco yaml é um MAPA com valor não-mapa no lugar da lista de regras', () => {
    // `path_globs` como mapa em vez de lista: `for...of` sobre objeto não itera
    // nada, então as regras existem no texto e nenhuma é verificada.
    const result = lintMatrix(
      fence('path_globs:\n  pattern: "apps/api/**"\n  reviewers: [code-reviewer]'),
    );
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('NÃO erra quando o bloco yaml é um mapa válido — o contrafactual do item 1', () => {
    const md = fence('path_globs:\n  - pattern: "apps/api/**"\n    reviewers: [code-reviewer]');
    expect(lintMatrix(md, ['code-reviewer']).errors).toEqual([]);
  });

  it('ERRO quando `commit_types` é lista — `Object.entries` sobre lista devolve índices e não regra nenhuma', () => {
    // Sem o guard, `rule` vira a string 'feat', `reviewers_added` é `undefined`,
    // `?? []` segura o laço e o lint sai verde sem ter olhado nenhuma regra.
    const result = lintMatrix(fence('commit_types:\n  - feat\n  - fix'));
    expect(result.errors.some((e) => /commit_types/.test(e))).toBe(true);
  });

  it('ERRO quando o bloco yaml é um mapa VAZIO — passa pelos dois laços e não entra na matriz', () => {
    // MEDIDO 2026-10-08: sem este teste o laço final era 0 de 18 — existia,
    // ninguém media, e ninguém achava. `{}` é mapa, então passa do `naoMapas`,
    // e `Object.assign(result, {})` não põe nada na matriz.
    const result = lintMatrix(fence('{}'));
    expect(result.errors.some((e) => /nenhum virou regra/.test(e))).toBe(true);
  });

  it('NÃO erra quando NÃO há bloco yaml nenhum', () => {
    expect(lintMatrix('# Review routing\n\nSem matriz ainda.\n').errors).toEqual([]);
  });
});
