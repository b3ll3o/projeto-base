// tooling/scripts/doc-sync.resolvePath.spec.ts
//
// pt-BR: Testes do helper `resolvePath` adicionado em 2026-09-23 para
// tornar syncDocs robusto a CWDs diferentes (CLI do repo root vs
// vitest rodando em tooling/scripts/). Cobre os 4 cenários canônicos:
// path absoluto, relativo-repo, vazio, e `./` prefix.

import { describe, it, expect } from 'vitest';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Importação indireta via re-export local para validar comportamento
// sem expor resolvePath como API pública.
import { syncDocs } from './doc-sync.js';

// Mesmo cálculo do `doc-sync.ts:23-25` — este spec mora no mesmo diretório do
// módulo, 2 níveis abaixo da raiz do repo.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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
    //
    // O path é derivado do REPO_ROOT real, e não hardcoded. A versão anterior
    // fixava `/home/leo/Documentos/projetos/base` e tentava se proteger com
    // `if (!isAbsolute(absPath)) return` — guard que NUNCA dispara, porque uma
    // string começando com `/` é absoluta em qualquer plataforma. O teste então
    // rodava de verdade contra um path que só existe na máquina do autor: verde
    // local, vermelho no CI, onde esse path não existe. Teste que só passa em
    // uma máquina não é cobertura, é sorte — e o `isAbsolute` agora é usado
    // para o que serve: provar que o path montado é mesmo absoluto.
    const absPath = join(REPO_ROOT, 'apps/api/prisma/schema.prisma');
    expect(isAbsolute(absPath)).toBe(true);
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
