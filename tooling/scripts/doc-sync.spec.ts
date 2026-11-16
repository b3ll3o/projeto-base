// tooling/scripts/doc-sync.spec.ts
//
// pt-BR: Testes do agent doc-sync. Cobre os 3 caminhos principais:
//   - Controller NestJS modificado dispara review da spec de contrato HTTP
//   - schema.prisma dispara review da spec de modelo de dados
//   - Arquivos monorepo (package.json) são ignorados
//
// Também cobre a regra de bloqueio: se algum doc referenciado não
// existir, deve gerar action `create`.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { syncDocs, GENERATED_DOC_FILES, modelsSemParDeHistorico } from './doc-sync.js';

const REPO = new URL('../..', import.meta.url).pathname;
const TSX = join(REPO, 'node_modules', '.bin', 'tsx');
const SCRIPT = join(REPO, 'tooling', 'scripts', 'doc-sync.ts');

/**
 * pt-BR (2026-11-16): fixtures do schema — o contrato do check de
 * History/Archive é testado com SCHEMA escrito à mão, não com o schema do
 * repo. Um teste que lê o arquivo real mede o arquivo real.
 */
const SCHEMA_SEM_PAR_DE_HISTORICO = `
enum AuditOperation {
  INSERT
  UPDATE
}

model Fatura {
  id        String   @id
  createdAt DateTime @default(now())
  createdBy String?
}

model User {
  id        String   @id
  createdAt DateTime @default(now())
  createdBy String?
}

model UserHistory {
  id String @id
}
`;

const SCHEMA_COM_PAR_DE_HISTORICO = `
enum AuditOperation {
  INSERT
  UPDATE
}

model Fatura {
  id        String   @id
  createdAt DateTime @default(now())
  createdBy String?
}

model FaturaArchive {
  id String @id
}
`;

/** Sem a enum de auditoria não há histórico de versão a esperar. */
const SCHEMA_SEM_ENUM_DE_AUDITORIA = `
model Fatura {
  id        String   @id
  createdAt DateTime @default(now())
  createdBy String?
}
`;

/** Roda o CLI no argv que `pnpm run` produz: newline vira a par `\\n`. */
function cliComLista(arquivos: string[]): string {
  const outFile = join(mkdtempSync(join(tmpdir(), 'doc-sync-')), 'report.json');
  return execFileSync(TSX, [SCRIPT, `--files=${arquivos.join('\\n')}`, `--out-file=${outFile}`], {
    cwd: REPO,
    encoding: 'utf8',
  });
}

describe('doc-sync', () => {
  it('detecta controller modificado', () => {
    const report = syncDocs(['apps/api/src/modules/users/infrastructure/http/users.controller.ts']);
    const review = report.actions.find((a) => a.type === 'review');
    expect(review).toBeDefined();
  });

  it('schema Prisma dispara review', () => {
    const report = syncDocs(['apps/api/prisma/schema.prisma']);
    expect(report.actions.length).toBeGreaterThan(0);
  });

  it('arquivos monorepo não disparam sync', () => {
    const report = syncDocs(['package.json']);
    expect(report.actions).toHaveLength(0);
  });

  it('schema sem AuditOperation dispara review de History/Archive', () => {
    // pt-BR (2026-11-16): este teste mentia sobre o que media. O NOME diz
    // "schema SEM AuditOperation", mas a fixture é o schema do REPO — que tem
    // a enum. E o código antigo emitia uma ação por model, todas com o mesmo
    // motivo: o parecer da semana saiu com 12 linhas idênticas (PR #167).
    // O guard também era o inverso do comentário — saía cedo justamente no
    // caso que a função existe para checar.
    //
    // O contrato agora é testado com FIXTURE (a função pura
    // `modelsSemParDeHistorico`), e não com o schema do repo: um teste que
    // depende do arquivo real mede o arquivo real, não a regra.
    expect(modelsSemParDeHistorico(SCHEMA_SEM_PAR_DE_HISTORICO)).toEqual(['Fatura']);
    expect(modelsSemParDeHistorico(SCHEMA_COM_PAR_DE_HISTORICO)).toEqual([]);
    expect(modelsSemParDeHistorico(SCHEMA_SEM_ENUM_DE_AUDITORIA)).toEqual([]);
  });

  it('controller com decorators de verbo HTTP dispara review', () => {
    const report = syncDocs(['apps/api/src/modules/users/infrastructure/http/users.controller.ts']);
    expect(
      report.actions.some(
        (a) =>
          a.type === 'review' &&
          /Endpoinst modificados|endpoints modificados|tabela de endpoints/i.test(a.reason),
      ),
    ).toBe(true);
  });

  it('arquivo fora de apps/packages/tooling mas que bate em mapping gera action', () => {
    // pt-BR: arquivo sob `.agents/agents/stack-code-reviewer.md` deve
    // disparar review do AGENTS.md (catalog).
    const report = syncDocs(['.agents/agents/stack-code-reviewer.md']);
    expect(report.actions.length).toBeGreaterThan(0);
  });

  it('relatório inclui docs_health_score entre 0 e 100', () => {
    const report = syncDocs(['apps/api/src/modules/users/infrastructure/http/users.controller.ts']);
    expect(report.docs_health_score).toBeGreaterThanOrEqual(0);
    expect(report.docs_health_score).toBeLessThanOrEqual(100);
  });

  it('lista vazia de files gera status no-changes e zero actions', () => {
    const report = syncDocs([]);
    expect(report.status).toBe('no-changes');
    expect(report.actions).toHaveLength(0);
  });

  it('todo doc mapeado existe, então `alerts` é 0 e o health é 100', () => {
    // MEDIDO 2026-10-15: o teste anterior se chamava "alerts aumentam quando
    // severidade major está presente" e afirmava `toBeGreaterThanOrEqual(0)` —
    // verdadeiro para TODO valor possível, inclusive o caso que ele dizia
    // descrever. Não media nada. Além disso: até 2026-10-15 NENHUM caminho do
    // código emitia `severity: 'major'` (os 3 emissores punham `minor` e o
    // `checkMissingDoc` não trazia severidade), então `alerts` era
    // estruturalmente 0 e o `|| exit 1` do pre-commit era código morto.
    //
    // O que este teste segura agora é o invariante que o CI depende: nenhum
    // `codePattern` aponta para um `docFile` morto. Se alguém mapeear um
    // controller para um doc que não existe, isto fica vermelho — que é a
    // direção em que o gate passa a reprovar de verdade.
    const controllers = [
      'apps/api/src/modules/auth/infrastructure/http/auth.controller.ts',
      'apps/api/src/modules/users/infrastructure/http/users.controller.ts',
      'apps/api/prisma/schema.prisma',
      'apps/api/src/modules/users/domain/value-objects/user-id.vo.ts',
      '.agents/agents/doc-sync.md',
    ];
    const report = syncDocs(controllers);
    expect(report.alerts).toBe(0);
    expect(report.docs_health_score).toBe(100);
  });
});

describe('docFile gerado não pode reprovar o CI', () => {
  // MEDIDO 2026-10-15: `apps/api/openapi.json` é artefato de `openapi:export`,
  // GITIGNORED (`.gitignore:11`) e nenhum job de CI roda o export. Com o
  // `severity: 'major'` + `exit(1)` novos, num checkout limpo o `auth.controller.ts`
  // dava `Alerts: 1 | Health 90/100` e EXIT=1 — e localmente passava, porque o
  // dev tem o arquivo gerado em disco.
  //
  // Os 2 primeiros testes usam `semArquivoGerado()` justamente por isso: com o
  // openapi.json em disco, a remoção do guard NÃO os deixa vermelhos (medido —
  // 14/14 verdes com a mutação aplicada), porque `existsSync` acha o arquivo e
  // o `create` nunca chega a ser emitido. É o teste que mentia por omissão.

  const CONTROLLER = 'apps/api/src/modules/auth/infrastructure/http/auth.controller.ts';
  const OPENAPI = join(REPO, 'apps', 'api', 'openapi.json');

  /** Reproduz o checkout limpo escondendo o artefato gerado (versionado desde o #125). */
  function semArquivoGerado<T>(fn: () => T): T {
    const existe = existsSync(OPENAPI);
    if (existe) renameSync(OPENAPI, `${OPENAPI}.bak-doc-sync-spec`);
    try {
      // Sanidade: se o sumiço não happen, o teste adiante passa vacuamente.
      expect(existsSync(OPENAPI), 'o openapi.json precisa estar ausente').toBe(false);
      return fn();
    } finally {
      if (existe) renameSync(`${OPENAPI}.bak-doc-sync-spec`, OPENAPI);
    }
  }

  it('não emite `create` para o openapi.json ausente, que ninguém versiona', () => {
    semArquivoGerado(() => {
      const report = syncDocs([CONTROLLER]);
      const cria = report.actions.filter(
        (a) => a.doc_file === 'apps/api/openapi.json' && a.type === 'create',
      );
      expect(cria).toEqual([]);
      // E o report inteiro segue verde — é este EXIT=1 que reprovava o CI.
      expect(report.alerts).toBe(0);
    });
  });

  it('mantém o openapi.json como alvo de `review` — o mapeamento não perdeu o sentido', () => {
    semArquivoGerado(() => {
      const report = syncDocs([CONTROLLER]);
      const revisa = report.actions.filter(
        (a) => a.doc_file === 'apps/api/openapi.json' && a.type === 'review',
      );
      expect(revisa.length).toBeGreaterThan(0);
    });
  });

  it('com o openapi.json AUSENTE, o gate ainda reprova um doc versionado que falta', () => {
    // Prova que o guard não virou "doc ausente não reprova mais nada": some
    // com um doc rastreado de verdade — `docs/STACK.md`, mapeado a partir de
    // `schema.prisma` — e o `major` tem que continuar saneando.
    const DOC = join(REPO, 'docs', 'STACK.md');
    const alvo = `${DOC}.bak-doc-sync-spec`;
    renameSync(DOC, alvo);
    try {
      expect(syncDocs(['apps/api/prisma/schema.prisma']).alerts).toBeGreaterThan(0);
    } finally {
      renameSync(alvo, DOC);
    }
  });

  it('todo docFile NÃO-gerado que o mapeamento produz é versionado no git', () => {
    // Fecha a classe: mapear um controller para um doc que ninguém versiona
    // deixa o CI vermelho em todo PR que tocar o controller.
    const controllers = [
      'apps/api/src/modules/auth/infrastructure/http/auth.controller.ts',
      'apps/api/src/modules/users/infrastructure/http/users.controller.ts',
      'apps/api/prisma/schema.prisma',
      'apps/api/src/modules/users/domain/value-objects/user-id.vo.ts',
      '.agents/agents/doc-sync.md',
    ];
    const versionados = new Set(
      execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 24 })
        .split('\n')
        .filter(Boolean),
    );
    const naoVersionados = syncDocs(controllers)
      .actions.map((a) => a.doc_file)
      .filter((f): f is string => !!f && !GENERATED_DOC_FILES.has(f))
      .filter((f) => !versionados.has(f));
    expect(naoVersionados).toEqual([]);
  });
});

describe('o parecer não repete linha (o defeito do PR #167)', () => {
  const SEMANA = [
    'apps/api/src/modules/auth/infrastructure/http/auth.controller.ts',
    'apps/api/src/modules/health/health.controller.ts',
    'apps/api/src/modules/users/infrastructure/http/users.controller.ts',
    'apps/api/prisma/schema.prisma',
  ];

  it('nenhuma linha do parecer repete doc + motivo', () => {
    // MEDIDO 2026-11-16: o parecer da semana tinha 24 ações das quais 15 eram
    // cópias — 12 linhas de "History/Archive" (uma por model, todas
    // idênticas) e 3 de "Endpoints modificados" (uma por controller, todas
    // idênticas). A tabela contava ruído como se fosse sinal.
    const chaves = syncDocs(SEMANA).actions.map((a) => `${a.doc_file}|${a.reason}`);
    expect(chaves.length).toBe(new Set(chaves).size);
  });

  it('o MESMO arquivo repetido na lista não repete ação', () => {
    // O relatório semanal passa a lista de arquivos da semana, e um arquivo
    // tocado em N commits entra N vezes.
    const uma = syncDocs(['apps/api/prisma/schema.prisma']).actions.length;
    const repetida = syncDocs([
      'apps/api/prisma/schema.prisma',
      'apps/api/prisma/schema.prisma',
      'apps/api/prisma/schema.prisma',
    ]).actions.length;
    expect(repetida).toBe(uma);
  });

  it('toda ação diz o arquivo que a disparou', () => {
    const report = syncDocs(SEMANA);
    expect(report.actions.length).toBeGreaterThan(0);
    for (const a of report.actions) {
      expect(a.source_file).toBeTruthy();
    }
    expect(report.files_changed).toContain('apps/api/prisma/schema.prisma');
  });

  it('o controller aponta para o doc canônico do SEU bounded context', () => {
    // O `health.controller.ts` apontava para a spec de contrato HTTP do
    // módulo de users: um doc que não tem o endpoint do health.
    const report = syncDocs(['apps/api/src/modules/health/health.controller.ts']);
    const docs = report.actions.map((a) => a.doc_file);
    expect(docs).toContain('docs/api/health.md');
    expect(docs).not.toContain(
      'docs/superpowers/specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md',
    );
  });
});

describe('doc-sync CLI (o caminho que o CI usa)', () => {
  it('processa a lista INTEIRA quando o argv traz `\\n` escapado', () => {
    // MEDIDO 2026-10-15: o `sync-docs.yml` passa a lista via `pnpm docs:sync`,
    // e o pnpm converte o newline do argv na par de caracteres `\n`. Com
    // `split('\n')` o syncDocs recebia 1 item: 161 arquivos viravam 1 revisado,
    // reportando Health 100/100. O `.husky/pre-commit` nunca viu o defeito
    // porque chama `pnpm tsx`, e aí o argv chega cru.
    const saida = cliComLista([
      'apps/api/src/modules/auth/infrastructure/http/auth.controller.ts',
      'apps/api/prisma/schema.prisma',
    ]);
    expect(saida).toContain('files=2');
  });

  it('o mesmo argv com newlines reais continua valendo (o caminho do hook)', () => {
    const outFile = join(mkdtempSync(join(tmpdir(), 'doc-sync-')), 'report.json');
    const saida = execFileSync(
      TSX,
      [
        SCRIPT,
        '--files=apps/api/src/modules/auth/infrastructure/http/auth.controller.ts\napps/api/prisma/schema.prisma',
        `--out-file=${outFile}`,
      ],
      { cwd: REPO, encoding: 'utf8' },
    );
    expect(saida).toContain('files=2');
  });
});
