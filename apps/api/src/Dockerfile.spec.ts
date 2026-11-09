// apps/api/src/Dockerfile.spec.ts
//
// pt-BR: spec RED→GREEN do Task 1.5 (Fase telemetria) — garante que o
// Dockerfile.prod auto-carrega o tracing OTel via NODE_OPTIONS de forma
// ESM-aware (`--import`, NÃO `--require`). Justificativa ESM:
// --require é CJS-only e quebra em runtime `type: module`; o projeto
// é ESM puro (`type: module`, `module: NodeNext`).
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

// Resolve absoluto a partir do arquivo .ts — cwd-independente (testes
// rodam do apps/api/, mas o spec pode ser descoberto por paths absolutos).
const DOCKERFILE_PATH = new URL('../Dockerfile', import.meta.url);

describe('Dockerfile prod target — OTel tracing bootstrap (Task 1.5)', () => {
  it('declara NODE_OPTIONS com --import (ESM-aware) apontando para telemetry/init.js', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    // --require é CJS-only e quebraria ESM (ERR_REQUIRE_ESM) — não aceitar
    expect(dockerfile).not.toMatch(/NODE_OPTIONS=.*--require/);
    // --import é a forma ESM-aware (Node 20.6+ / 22+); path deve terminar em telemetry/init.js
    expect(dockerfile).toMatch(/NODE_OPTIONS=.*--import\s+\S*telemetry\/init\.js/);
  });

  // ⚠️ (#137): o `exec` ANTES do `node` é o que faz o SIGTERM chegar ao
  // processo Node. Sem ele, o `&&` faz o `sh` forkar o `node` e continuar
  // vivo como pai — a árvore real é `tini → sh → node` — e o sinal que o
  // `docker stop` manda para o PID 1 (o tini) chega ao `sh`, que não
  // repassa. O `enableShutdownHooks()` do NestJS nunca roda, e o container
  // só morre por SIGKILL no fim do grace period.
  it('o ENTRYPOINT usa `exec` antes do node — o SIGTERM chega ao processo (#137)', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    // ⚠️ A linha inteira: o ENTRYPOINT tem um `[ -z … ]` DENTRO do JSON, e
    // um regex que para no primeiro `]` cortaria a linha no meio.
    const entrypoint = /^ENTRYPOINT\s*(.+)$/m.exec(dockerfile);
    expect(entrypoint).not.toBeNull();
    // A cadeia é `… && exec node dist/main.js` — e o `exec` é o que troca o
    // PID do shell pelo PID do node.
    expect(entrypoint![1]).toMatch(/&&\s*exec node dist\/main\.js/);
    // E o `exec` NÃO pode vir antes do `migrate` (que precisa do shell).
    expect(entrypoint![1]).toMatch(/prisma migrate deploy[\s\S]*&&\s*exec node/);
  });

  // ⚠️ (#139): o probe do healthcheck NÃO pode depender de um pacote
  // instalado — o stage `dev` não tem o `curl` do `prod`, e o compose de dev
  // herda o probe do compose base. O `node` está nas DUAS imagens.
  it('o HEALTHCHECK usa o node da imagem — e não um pacote instalado (#139)', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    const healthcheck = /HEALTHCHECK[\s\S]*?\n\s*CMD ([^\n]*)/.exec(dockerfile);
    expect(healthcheck).not.toBeNull();
    expect(healthcheck![1]).toContain('node -e');
    expect(healthcheck![1]).not.toMatch(/\bcurl\b/);
    expect(healthcheck![1]).not.toMatch(/\bwget\b/);
  });

  it('o stage prod NÃO instala mais o curl (ele existia só para o probe) (#139)', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    // ⚠️ O `curl` não pode estar em NENHUM stage: o probe é o mesmo nos
    // dois, e um `curl` em algum stage seria a isca de um probe que volta.
    const installs = [...dockerfile.matchAll(/apt-get install[^\n]*/g)].map((m) => m[0]);
    for (const linha of installs) {
      expect(linha).not.toMatch(/\bcurl\b/);
    }
  });

  it('mantém ENTRYPOINT/CMD executando node dist/main.js no target prod', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    // prod usa ENTRYPOINT (não CMD) por causa do `sh -c` que encadeia
    // `prisma migrate deploy` antes do `node dist/main.js`. A regex
    // aceita ambos para preservar o intent do teste.
    expect(dockerfile).toMatch(/(?:CMD|ENTRYPOINT).*node.*dist\/main/);
  });

  it('NODE_OPTIONS aponta para dist/ (artefato compilado), não src/', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    // Em prod rodamos a partir de apps/api/dist/ (output do `tsc -p tsconfig.build.json`)
    expect(dockerfile).not.toMatch(/NODE_OPTIONS=.*src\/shared\/infrastructure\/telemetry/);
  });

  it('NODE_OPTIONS aponta para init.js (não tracing.js) para garantir side-effect', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    // init.js é o bootstrap side-effect que chama initTracing() no top-level
    expect(dockerfile).toMatch(/NODE_OPTIONS=.*telemetry\/init\.js/);
    // tracing.js puro não tem side-effect (protegido por tracing.spec.ts:28-35),
    // então NÃO deve ser o target direto do --import
    expect(dockerfile).not.toMatch(/NODE_OPTIONS=.*telemetry\/tracing\.js/);
  });
});

// ─── #128: o `COPY` do prisma e do scripts ────────────────────────────────────
//
// pt-BR: o `COPY` do Docker com VÁRIOS caminhos e um destino de diretório
// copia o CONTEÚDO de cada caminho direto para o destino — não as pastas.
// `COPY --from=builder /repo/apps/api/prisma /repo/apps/api/scripts apps/api/`
// deixava `schema.prisma` e `prepara-papeis.sh` soltos em `/repo/apps/api/`, e o
// ENTRYPOINT (`--schema=prisma/schema.prisma` e `sh ./scripts/prepara-papeis.sh`)
// não achava nenhum dos dois: a imagem de produção da API não subia.
//
// O conserto são DOIS `COPY`, um por pasta. Estes testes são o DENTE do
// conserto: sem eles, voltar à forma achatada passa tudo em silêncio —
// nenhum gate do repo mede o destino de um `COPY`, e o defeito volta.

/** Um `COPY` do builder, já partido em fontes e destino. */
interface CopyDoBuilder {
  /** Os caminhos de origem (o último token do `COPY` é o destino). */
  fontes: string[];
  /** O caminho de destino. */
  destino: string;
}

/** Tira a barra final — `apps/api/` e `apps/api` são o MESMO destino. */
function semBarraFinal(caminho: string): string {
  return caminho.replace(/\/+$/, '');
}

/** O último segmento do caminho — `prisma`, `scripts`, `dist`… */
function ultimoSegmento(caminho: string): string {
  const partes = semBarraFinal(caminho).split('/');
  return partes[partes.length - 1] ?? '';
}

/**
 * Todos os `COPY --from=builder`, com as fontes e o destino separados.
 *
 * ⚠️ A origem e o destino NÃO são distinguíveis por regex solta: o destino é
 * o ÚLTIMO token, e as flags (`--from=builder`) saem antes da contagem. Sem
 * isso, `COPY --from=builder A B C` seria lido como "fonte = B, destino = C"
 * quando o destino é `C` e as fontes são `A` e `B` — que é o caso real.
 */
function copiesDoBuilder(dockerfile: string): CopyDoBuilder[] {
  return dockerfile
    .split('\n')
    .filter((linha) => /^\s*COPY\s/i.test(linha))
    .filter((linha) => /--from=builder\b/.test(linha))
    .map((linha) => {
      const tokens = linha
        .trim()
        .replace(/^COPY\s+/i, '')
        .split(/\s+/)
        .filter((token) => token !== '' && !token.startsWith('--'));
      return { fontes: tokens.slice(0, -1), destino: tokens[tokens.length - 1] ?? '' };
    });
}

describe('Dockerfile prod — o COPY do prisma e do scripts preserva as pastas (#128)', () => {
  it('copia o prisma para apps/api/prisma — a pasta sobrevive ao COPY', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    const copia = copiesDoBuilder(dockerfile).find(
      (c) =>
        semBarraFinal(c.destino) === 'apps/api/prisma' &&
        c.fontes.some((f) => semBarraFinal(f) === '/repo/apps/api/prisma'),
    );
    expect(
      copia,
      'nenhum `COPY --from=builder` leva `/repo/apps/api/prisma` para `apps/api/prisma` — ' +
        'sem a pasta `prisma/` o ENTRYPOINT não acha `--schema=prisma/schema.prisma` (#128)',
    ).toBeDefined();
  });

  it('copia o scripts para apps/api/scripts — a pasta sobrevive ao COPY', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    const copia = copiesDoBuilder(dockerfile).find(
      (c) =>
        semBarraFinal(c.destino) === 'apps/api/scripts' &&
        c.fontes.some((f) => semBarraFinal(f) === '/repo/apps/api/scripts'),
    );
    expect(
      copia,
      'nenhum `COPY --from=builder` leva `/repo/apps/api/scripts` para `apps/api/scripts` — ' +
        'sem a pasta `scripts/` o ENTRYPOINT não acha `sh ./scripts/prepara-papeis.sh` (#128)',
    ).toBeDefined();
  });

  it('NENHUM COPY do builder achata `prisma`/`scripts` direto em `apps/api/`', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    // ⚠️ O filtro é o DESTINO (`apps/api`) E a ORIGEM (`prisma`/`scripts`) — não
    // o destino sozinho: `COPY --from=builder /repo/apps/api/package.json
    // apps/api/` é legítimo (um ARQUIVO no diretório), e achatar essa também
    // acusaria um `COPY` correto.
    const achatas = copiesDoBuilder(dockerfile)
      .filter((c) => semBarraFinal(c.destino) === 'apps/api')
      .filter((c) => c.fontes.some((f) => ['prisma', 'scripts'].includes(ultimoSegmento(f))))
      .map((c) => `${c.fontes.join(' ')} -> ${c.destino}`);
    expect(
      achatas,
      'um `COPY --from=builder` com `prisma`/`scripts` e destino `apps/api/` ACHATA as ' +
        'pastas: o conteúdo cai direto em `/repo/apps/api/` e o ENTRYPOINT não acha ' +
        '`prisma/schema.prisma` nem `./scripts/prepara-papeis.sh` (#128)',
    ).toEqual([]);
  });
});
