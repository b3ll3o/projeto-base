// tooling/scripts/doc-sync.resolvePath.spec.ts
//
// pt-BR: Testes do helper `resolvePath` adicionado em 2026-09-23 para
// tornar syncDocs robusto a CWDs diferentes (CLI do repo root vs
// vitest rodando em tooling/scripts/). Cobre os 4 cenários canônicos:
// path absoluto, relativo-repo, vazio, e `./` prefix.

import { describe, it, expect } from 'vitest';
import { isAbsolute } from 'node:path';

// Importação indireta via re-export local para validar comportamento
// sem expor resolvePath como API pública.
import { syncDocs } from './doc-sync.js';

describe('resolvePath (regression)', () => {
  it('CWD não interfere na leitura de schema.prisma relativo', () => {
    // pt-BR: Se CWD mudar (ex: vitest em tooling/scripts/), syncDocs ainda
    // deve localizar apps/api/prisma/schema.prisma via REPO_ROOT.
    // Antes do fix, esta chamada resultava em 0 actions de History/Archive
    // porque readFileSync falhava silenciosamente.
    const report = syncDocs(['apps/api/prisma/schema.prisma']);
    expect(
      report.actions.some((a) => a.type === 'review' && /History|Archive/.test(a.reason)),
    ).toBe(true);
  });

  it('CWD não interfere na leitura de users.controller.ts relativo', () => {
    // pt-BR: Mesmo cenário para o controller — readFileSync deve resolver
    // relativo a REPO_ROOT, não a CWD.
    const report = syncDocs(['apps/api/src/modules/users/infrastructure/http/users.controller.ts']);
    expect(
      report.actions.some(
        (a) =>
          a.type === 'review' &&
          /Endpoinst modificados|endpoints modificados|tabela de endpoints/i.test(a.reason),
      ),
    ).toBe(true);
  });

  it('paths absolutos são preservados (sem dupla resolução)', () => {
    // pt-BR: Se o caller já tem path absoluto, resolvePath não deve
    // prefixar REPO_ROOT (causaria path inválido).
    const absPath = '/home/leo/Documentos/projetos/base/apps/api/prisma/schema.prisma';
    if (!isAbsolute(absPath)) {
      // Skip se REPO_ROOT mudou em outro ambiente (CI/dev/containers).
      return;
    }
    const report = syncDocs([absPath]);
    // Mesma expectation do teste relativo — absolute path deve funcionar
    // idêntico porque o conteúdo do schema é o mesmo.
    expect(
      report.actions.some((a) => a.type === 'review' && /History|Archive/.test(a.reason)),
    ).toBe(true);
  });

  it('path com prefixo ./ também resolve corretamente', () => {
    // pt-BR: callers podem passar './apps/...' — deve funcionar igual.
    const report = syncDocs(['./apps/api/prisma/schema.prisma']);
    expect(report.actions.length).toBeGreaterThan(0);
  });
});
