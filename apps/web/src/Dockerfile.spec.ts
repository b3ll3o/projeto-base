// apps/web/src/Dockerfile.spec.ts
//
// pt-BR: spec RED→GREEN do conserto do #138 — o `ENV HOSTNAME=0.0.0.0` no
// stage `prod` do Dockerfile do web.
//
// ⚠️ O QUE O DEFEITO ERA: o `server.js` do Next.js standalone tira o
// ENDEREÇO DE BIND de `process.env.HOSTNAME` (`const hostname =
// process.env.HOSTNAME || '0.0.0.0'`), e o daemon do Docker exporta
// `HOSTNAME` em TODO container — com o SHORT-ID dele, que resolve para o IP
// do container, NÃO para `127.0.0.1`. Resultado: o servidor escutava no IP
// do container, o probe em `http://localhost:3001/api/health` nunca conectava,
// e o serviço ficava `unhealthy` PERMANENTE — com a app no ar.
//
// ⚠️ POR QUE ESTE SPEC EXISTE: `grep -rn HOSTNAME .tooling/scripts/ci/*.ts`
// → 0 hits. Nenhum gate do repo media o bind do servidor do web, e o web não
// tinha spec de Dockerfile. O conserto estava no lugar e sem dente: apagar a
// linha e o defeito voltava em silêncio.
//
// ⚠️ A ASSERÇÃO É DO STAGE `prod`, E NÃO DO ARQUIVO: o stage `dev` também
// declara `ENV HOSTNAME=0.0.0.0` (ele é DEFENSIVO — o `next dev` tira o
// endereço da flag `-H`, não do ambiente). Um teste que varresse o arquivo
// inteiro passaria com o `prod` quebrado — que é exatamente o defeito.
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

// Resolve absoluto a partir do arquivo .ts — cwd-independente (o spec pode
// ser descoberto por path absoluto, e o `vitest run` do web roda da raiz do
// app).
const DOCKERFILE_PATH = new URL('../Dockerfile', import.meta.url);

/**
 * O corpo de um stage do Dockerfile — as linhas entre o `FROM … AS <nome>` e o
 * próximo `FROM`.
 *
 * ⚠️ `AS` é case-insensitive no Docker, e o stage pode ser declarado com
 * `FROM <imagem> AS prod` — por isso o regex aceita `as`/`AS`/`As`.
 */
function stageDoDockerfile(dockerfile: string, nome: string): string {
  const linhas = dockerfile.split('\n');
  const abertura = new RegExp(`^FROM\\s+.*\\s+AS\\s+${nome}\\s*$`, 'i');
  const inicio = linhas.findIndex((linha) => abertura.test(linha.trim()));
  if (inicio === -1) return '';
  let fim = linhas.length;
  for (let i = inicio + 1; i < linhas.length; i++) {
    if (/^\s*FROM\s/i.test(linhas[i] ?? '')) {
      fim = i;
      break;
    }
  }
  return linhas.slice(inicio + 1, fim).join('\n');
}

describe('Dockerfile do web — stage prod', () => {
  it('declara HOSTNAME=0.0.0.0 — o bind do server.js standalone (#138)', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    const prod = stageDoDockerfile(dockerfile, 'prod');
    // Sem esta linha o stage `prod` nem existe — e o teste PASSARIA por
    // ausência (o `toMatch` sobre string vazia é falso, mas a falha viria
    // como "não casou", sem dizer que o stage sumiu). O `expect` do stage
    // abaixo separa os dois casos.
    expect(prod, 'o Dockerfile do web não tem um stage `prod`').not.toBe('');
    // O `ENV` do prod é `ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0`:
    // as três chaves dividem a MESMA linha, e é por isso que a regex ancora em
    // `ENV` e não em linha isolada.
    expect(
      prod,
      'o stage `prod` não declara `HOSTNAME=0.0.0.0` — sem ela o `server.js` ' +
        'escuta no IP do container (o `HOSTNAME` exportado pelo daemon) e o probe ' +
        'em `localhost:3001` nunca conecta: o serviço fica `unhealthy` (#138)',
    ).toMatch(/^\s*ENV\s+.*\bHOSTNAME=0\.0\.0\.0\b/m);
  });

  it('o HEALTHCHECK não chama `curl` nem `wget` — o binário não existe na imagem', async () => {
    const dockerfile = await readFile(DOCKERFILE_PATH, 'utf8');
    // ⚠️ O `CMD` do probe vem na LINHA SEGUINTE (o `HEALTHCHECK` termina em
    // `\`), e é ela que carrega o comando — pegar a linha do `HEALTHCHECK`
    // mediria as opções (`--interval=…`) em vez do binário.
    const healthcheck = /HEALTHCHECK[\s\S]*?\n\s*CMD ([^\n]*)/.exec(dockerfile);
    expect(healthcheck, 'o Dockerfile do web não tem HEALTHCHECK').not.toBeNull();
    // `node:22-bookworm-slim` não tem `curl` nem `wget` — o probe tem de usar
    // o `node` da imagem, como o gate `check-docker-healthcheck-binary`
    // exige. Um probe com binário ausente morre com "not found" e deixa o
    // serviço `unhealthy` para sempre (#139).
    expect(healthcheck![1]).not.toMatch(/\bcurl\b/);
    expect(healthcheck![1]).not.toMatch(/\bwget\b/);
  });
});
