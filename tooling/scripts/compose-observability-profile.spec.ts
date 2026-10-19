// tooling/scripts/compose-observability-profile.spec.ts
//
// pt-BR: Smoke spec do docker compose profile `observability` adicionado em T5.2.
// Faz shell-out para `docker compose config` (sem e com `--profile observability`)
// e valida 6 invariantes do serviço `otel-collector`:
//
//   1. Default profile EXCLUI otel-collector (gating por profile funciona).
//   2. Profile `observability` INCLUI otel-collector.
//   3. Imagem pinada em `otel/opentelemetry-collector-contrib:0.103.0` (sem `:latest`).
//   4. Volume mount aponta para `infra/otelcol/config.yaml` em modo read-only.
//   5. Portas OTLP gRPC (4317) e HTTP (4318) expostas.
//   6. Comando `--config=/etc/otelcol/config.yaml` presente.
//
// Defende contra regressões futuras em T5.2 (e.g., alguém acidentalmente
// tirando o `profiles: [observability]`, fixando a imagem em `:latest`,
// perdendo o volume mount ou trocando as portas).
//
// Notas de formato do `docker compose config`:
//   - `source: ./infra/otelcol/config.yaml` no YAML vira
//     `source: /<abs>/infra/otelcol/config.yaml` no render (path absoluto).
//   - `ports: ['4317:4317']` vira `published: "4317"` (string com aspas).
//   - Indentação: 4 espaços para chaves de serviço, 8 para campos aninhados.

import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// spec vive em tooling/scripts/, REPO_ROOT está 2 níveis acima.
// Em URL resolution do Node, `..` aplicado a um file URL remove o basename
// do arquivo como 1 segmento + sobe 1 diretório a mais, então do path
// `.../base/tooling/scripts/foo.spec.ts` precisamos de 2 `..`s para chegar
// em `.../base/`.
const REPO_ROOT = new URL('../..', import.meta.url).pathname;

// pt-BR: valor inventado, posto no `.env.production` stubado, para o teste de
// vazamento ter algo REAL para não achar. Se o `.env.production` da máquina
// existir, o teste roda contra ele — e aí a asserção (que é de ausência)
// continua válida sem precisar do canário.
const CANARIO = 'GF_SECURITY_ADMIN_PASSWORD=CANARIO_NAO_E_UM_SEGREDO_REAL';

// pt-BR: `docker compose config` imprime os serviços em ORDEM ALFABÉTICA
// (MEDIDO 2026-10-19: api, grafana, otel-collector, postgres, prometheus,
// tempo, web), não na ordem do arquivo. Logo `grafana < tempo` e um corte
// `slice(inicio, indexOf('\n  grafana:'))` devolve `-1` — que o JS lê como
// "último caractere", ampliando o bloco para o resto do arquivo. O helper
// ancora na PRÓXIMA chave de nível serviço (2 espaços + não-espaço).
//
// O segundo corte (MEDIDO 2026-10-19) é para chave de NÍVEL TOPO: `web` é o
// último serviço em ordem alfabética, então não há "próximo serviço" e o
// primeiro corte devolve `-1` — jogando o bloco para o resto do arquivo, já
// com `networks:` e `volumes:` dentro. Chave de serviço tem 2 espaços de
// indentação, então `\S` só casa na coluna 0. Os dois limites valem; o menor
// é o fim.
function blocoDoServico(cfg: string, svc: string): string {
  const inicio = cfg.search(new RegExp(`^  ${svc}:$`, 'm'));
  if (inicio < 0) return '';
  const resto = cfg.slice(inicio);
  const proxServico = resto.slice(1).search(/^ {2}\S/m);
  const corteServico = proxServico < 0 ? Infinity : proxServico + 1;
  const proxTopo = resto.slice(1).search(/\n(?=\S)/);
  const corteTopo = proxTopo < 0 ? Infinity : proxTopo + 1;
  return resto.slice(0, Math.min(corteServico, corteTopo));
}

// pt-BR: o `read_only: true` que prova que um MOUNT é read-only é o que vem
// logo DEPOIS do `target:` daquele mount — não qualquer `read_only: true` do
// render. MEDIDO 2026-10-19 com `:ro` removido do mount do tempo:
//
//   COM  :ro →  target: /etc/tempo/tempo.yaml
//                    read_only: true
//                    bind: {create_host_path: true}
//   SEM :ro →  target: /etc/tempo/tempo.yaml
//                    bind: {create_host_path: true}      ← a LINHA some
//
// E o bloco do tempo continua tendo 1 `read_only: true` (o do rootfs, outro
// hardening). Por isso um `/read_only:\s+true/` genérico passava com a config
// do Tempo gravável: 12/12 verdes na mutação.
function mountReadOnly(cfg: string, target: string): boolean {
  return new RegExp(`target:\\s+${target}\\n\\s+read_only:\\s+true`).test(cfg);
}

// pt-BR: `docker compose config` materializa o conteúdo do `env_file` em TEXTO
// CLARO, e 14 das asserções deste arquivo recebem o render inteiro — o vitest
// imprime a string recebida em `+ Received:` quando um `expect` falha. Um teste
// vermelho virava, assim, um vazamento de `JWT_SECRET` /
// `GF_SECURITY_ADMIN_PASSWORD` para o log do CI.
//
// Aqui a chave é preservada e só o VALOR some, porque nenhuma das 25 asserções
// olha valor de ambiente (as regexes exigem `published:`, `host_ip:`, `image:`,
// `source:`, `target:` — todas minúsculas).
//
// O discriminador é a FORMA, não uma lista de nomes de segredo: MEDIDO
// 2026-10-19, 66 linhas de variável de ambiente caem (17 no bloco `api`, 16 no
// `grafana`, 15 no `otel-collector`, 3 no `web`) e NENHUMA chave do Compose é
// maiúscula-com-underscore — a spec do Compose é minúscula inteira.
//
// `-?` cobre `environment: - CHAVE=valor`, que o Compose renderiza como
// `- CHAVE=valor` e que a forma `CHAVE: valor` deixaria passar inteira.
//
// shortcut: env var nomeada em minúsculas passaria sem máscara. Nenhuma existe
// no repo; se aparecer, o teste do canário abaixo deixa de valer.
function mascaraSegredos(render: string): string {
  return render.replace(
    /^(\s*)(-\s*)?([A-Z][A-Z0-9_]*)([:=]).*$/gm,
    (_todo, indent, traco, chave, sep) => `${indent}${traco ?? ''}${chave}${sep}<oculto>`,
  );
}

function composeConfig(profile?: string): string {
  const profileFlag = profile ? ` --profile ${profile}` : '';
  // pt-BR: #68 mudou `POSTGRES_PASSWORD` para failing-interpolation em
  // produção. O spec precisa passar um dummy aqui (não roda postgres de
  // verdade — só valida estrutura do YAML). Mesma coisa para DATABASE_URL,
  // obrigatório em `api.environment`. .env.production é o env_file do
  // service postgres e api — criamos um stub temporário para o spec não
  // falhar em dev/CI onde ele não existe. Removido no `finally`.
  const envFile = `${REPO_ROOT}.env.production`;
  const fs = require('node:fs') as typeof import('node:fs');
  const envFileExisted = fs.existsSync(envFile);
  if (!envFileExisted) {
    // O canário é o que dá dente ao guard de vazamento (teste "não carrega o
    // conteúdo do env_file"). Um stub vazio faria a asserção passar sem ter
    // nada para verificar: `not.toContain` de uma string que nunca existiu é
    // verde por ausência de dado, não por correção.
    fs.writeFileSync(envFile, `${CANARIO}\n`, { mode: 0o600 });
  }
  try {
    return mascaraSegredos(
      execSync(`docker compose${profileFlag} config`, {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        // ⚠️ ESTE `env` É O QUE FAZ OS 6 TESTES ABAIXO DIZEREM ALGUMA COISA.
        //
        // Sem ele, o `execSync` HERDA o ambiente e o Compose lê o `.env` da RAIZ
        // do repo (o project directory é o diretório do próprio compose file, não
        // o `cwd`). Ou seja: numa máquina de dev que tenha `JWT_SECRET` no shell
        // ou no `.env`, uma interpolação `${JWT_SECRET:?...}` — que faz TODOS os
        // comandos do Compose falharem, `config` inclusive — aparecia como VERDE
        // neste arquivo.
        //
        // MEDIDO 2026-10-13 contra um compose com `${JWT_SECRET:?...}`:
        //
        //   env -u JWT_SECRET …                                 -> exit 1  (guard)
        //   JWT_SECRET=segredo-dev …                            -> exit 0  (falso verde)
        //   COMPOSE_DISABLE_ENV_FILE=1 … + `.env` com segredo   -> exit 0  (falso verde)
        //
        // As duas travas juntas fecham as duas fontes: `JWT_SECRET: undefined`
        // tira a variável exportada do ambiente (o Node descarta a chave
        // inteira — medido) e `COMPOSE_DISABLE_ENV_FILE` impede o Compose de ir
        // buscar o `.env`. Com as duas, o suite é verde por CONTA PRÓPRIA e o
        // vermelho significa de fato "o compose não interpola sem segredo".
        //
        // ⚠️ `COMPOSE_DISABLE_ENV_FILE` NÃO desliga o `env_file:` explícito do
        // serviço — MEDIDO: com a variável em `1` e os dois arquivos em disco,
        // o `docker compose config` ainda imprimiu o valor do
        // `.env.production` explícito. Só o `.env` implícito da raiz é
        // desligado, que é exatamente a fonte que este guard precisa fechar.
        //
        // ⚠️ POR QUE MASCARA E NÃO USA `--no-interpolate`: a flag existe e
        // funciona — MEDIDO 2026-10-19: ela zera os segredos no render (20 → 0),
        // e o `--help` mente sobre o nome dela (diz que impede interpolação,
        // mas é ela que resolve o `env_file`; `--no-env-resolution` NÃO
        // impede). Mas ela E TAMBÉM quebra o gating de profile, que é o que este
        // arquivo existe para verificar:
        //
        //   docker compose config                     -> api postgres web backend frontend
        //   docker compose config --no-interpolate    -> + tempo grafana otel-collector
        //
        // Quatro testes cairam com a flag. A correção de origem portanto não é
        // viável aqui, e o conserto é no ponto de uso.
        env: {
          ...process.env,
          POSTGRES_PASSWORD: 'test-fixture-not-real',
          DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
          JWT_SECRET: undefined,
          COMPOSE_DISABLE_ENV_FILE: '1',
        },
      }),
    );
  } finally {
    if (!envFileExisted) {
      try {
        fs.unlinkSync(envFile);
      } catch {
        /* already removed */
      }
    }
  }
}

describe('docker compose profile: observability (Task 5.4)', () => {
  it('exclui otel-collector do default profile (gating funciona)', () => {
    const defaultConfig = composeConfig();
    const matches = (defaultConfig.match(/^  otel-collector:/gm) ?? []).length;
    expect(matches).toBe(0);
  });

  it('inclui otel-collector quando --profile observability é setado', () => {
    const obsConfig = composeConfig('observability');
    expect(obsConfig).toMatch(/^  otel-collector:/m);
  });

  it('pina imagem em otel/opentelemetry-collector-contrib:0.103.0 (sem :latest)', () => {
    const obsConfig = composeConfig('observability');
    expect(obsConfig).toMatch(/image:\s+otel\/opentelemetry-collector-contrib:0\.103\.0/);
    // Garante que NENHUMA linha de imagem do otel-collector termina em :latest.
    expect(obsConfig).not.toMatch(/image:\s+otel\/opentelemetry-collector.*:latest/m);
  });

  it('monta infra/otelcol/config.yaml read-only em /etc/otelcol/config.yaml', () => {
    const obsConfig = composeConfig('observability');
    const bloco = blocoDoServico(obsConfig, 'otel-collector');
    // `docker compose config` normaliza `source:` para path absoluto.
    expect(bloco).toMatch(/source:\s+\/.*infra\/otelcol\/config\.yaml/);
    expect(bloco).toMatch(/target:\s+\/etc\/otelcol\/config\.yaml/);
    expect(mountReadOnly(bloco, '/etc/otelcol/config\\.yaml')).toBe(true);
  });

  it('expõe portas OTLP gRPC (4317) e HTTP (4318)', () => {
    const obsConfig = composeConfig('observability');
    expect(obsConfig).toMatch(/published:\s+"4317"/);
    expect(obsConfig).toMatch(/published:\s+"4318"/);
  });

  it('passa --config=/etc/otelcol/config.yaml como argumento de command', () => {
    const obsConfig = composeConfig('observability');
    expect(obsConfig).toMatch(/--config=\/etc\/otelcol\/config\.yaml/);
  });
});

// pt-BR (2026-10-19): os três backends que o usuário abre para ACOMPANHAR a
// telemetria — Tempo (traces), Prometheus (métricas) e Grafana (a tela).
//
// O invariant que importa aqui não é "o serviço existe" (isso o compose
// denuncia em 1 erro de parse) e sim o GATING: se alguém tirar
// `profiles: [observability]` de um deles, `docker compose up` passa a subir
// Grafana + Tempo + Prometheus em toda ida de `pnpm dev`, e o sintoma é
// lentidão e memória a mais — não um erro. Por isso o teste 1 existe.
describe('docker compose profile: observability (backends de acompanhamento)', () => {
  const BACKENDS = ['tempo', 'prometheus', 'grafana'] as const;

  it('exclui tempo, prometheus e grafana do default profile', () => {
    const defaultConfig = composeConfig();
    for (const svc of BACKENDS) {
      expect(defaultConfig.match(new RegExp(`^  ${svc}:`, 'gm')) ?? []).toHaveLength(0);
    }
  });

  it('inclui os três com --profile observability', () => {
    const obsConfig = composeConfig('observability');
    for (const svc of BACKENDS) {
      expect(obsConfig).toMatch(new RegExp(`^  ${svc}:`, 'm'));
    }
  });

  it('pina as três imagens por digest (imutável, nunca :latest)', () => {
    const obsConfig = composeConfig('observability');
    for (const img of ['grafana/tempo', 'prom/prometheus', 'grafana/grafana']) {
      expect(obsConfig).toMatch(new RegExp(`image:\\s+${img}:\\S+@sha256:[0-9a-f]{64}`));
    }
  });

  it('publica Grafana e Prometheus só no loopback', () => {
    const obsConfig = composeConfig('observability');
    // MEDIDO 2026-10-19 no `docker compose config`: `127.0.0.1:3300:3000`
    // renderiza como `host_ip: 127.0.0.1` + `target` + `published`, e uma
    // porta sem o prefixo de loopback NÃO emite `host_ip` nenhum. Assertar
    // o par `host_ip`+`published` é o que prova o binding; assertar só
    // `published: "3300"` passaria com a porta escutando em 0.0.0.0 — que é
    // expor o Grafana para toda a rede em que a máquina estiver.
    for (const published of ['3300', '9090']) {
      expect(obsConfig).toMatch(
        new RegExp(`host_ip:\\s+127\\.0\\.0\\.1[\\s\\S]{0,80}?published:\\s+"${published}"`),
      );
    }
  });

  it('blocoDoServico para no fim também quando o serviço é o ÚLTIMO do render', () => {
    // `web` é o último serviço em ordem alfabética (MEDIDO), então não existe
    // "próximo serviço" e um corte só por serviço devolve o resto do arquivo —
    // já com `networks:` e `volumes:` dentro. Nenhum outro teste exercita isso,
    // porque nenhum outro usa o último serviço.
    const obsConfig = composeConfig('observability');
    const bloco = blocoDoServico(obsConfig, 'web');
    expect(bloco).not.toBe('');
    expect(bloco).toMatch(/^ {2}\S+/m); // tem conteúdo
    expect(bloco).not.toMatch(/^networks:/m);
    expect(bloco).not.toMatch(/^volumes:/m);
  });

  it('NÃO carrega o conteúdo do env_file no render (senha não vaza em falha)', () => {
    // Verificação de integração: nada de `env_file` chega ao render.
    //
    // ⚠️ Este teste só tem dente ONDE O CANÁRIO EXISTE — isto é, onde não há
    // `.env.production` e o stub é escrito (CI). MEDIDO 2026-10-19 numa máquina
    // de dev com o arquivo real: o stub não é criado, o canário não existe, e
    // a asserção é verde por AUSÊNCIA DE DADO, não por correção. Por isso o
    // dente real de `mascaraSegredos` está no teste unitário abaixo, que roda
    // em qualquer máquina.
    const obsConfig = composeConfig('observability');
    expect(obsConfig).not.toMatch(/GF_SECURITY_ADMIN_PASSWORD:/);
  });

  it('mascaraSegredos tira o valor e preserva a chave, sem comer o resto do render', () => {
    // Dente real da máscara, independente de haver `.env.production` na máquina.
    // MEDIDO 2026-10-19: sem esta função o render carrega 20 valores em claro
    // (MEDIDO no render com o `.env.production.example` inteiro) e qualquer
    // `expect` vermelho os despeja no `+ Received:`.
    const entrada = [
      'services:',
      '  grafana:',
      '    environment:',
      '      GF_SECURITY_ADMIN_PASSWORD: SENHA_DE_VERDADE',
      '      GF_USERS_ALLOW_SIGN_UP: "false"',
      '    ports:',
      '      - target: 3300',
      '        published: "3300"',
      '        host_ip: 127.0.0.1',
    ].join('\n');

    const saida = mascaraSegredos(entrada);

    expect(saida).not.toContain('SENHA_DE_VERDADE');
    // a chave continua visível — é o que permite um assert sobre a chave
    expect(saida).toMatch(/GF_SECURITY_ADMIN_PASSWORD:<oculto>/);
    // TODO valor de env some, inclusive o que não é segredo
    expect(saida).toMatch(/GF_USERS_ALLOW_SIGN_UP:<oculto>/);
    // e o que NÃO é env var sobrevive intacto: sem isto a máscara passaria
    // apagando a configuração inteira e os outros testes virariam vacuosos
    expect(saida).toContain('target: 3300');
    expect(saida).toContain('published: "3300"');
    expect(saida).toContain('host_ip: 127.0.0.1');
  });

  it('NÃO publica o Tempo — ele é consultado pelo Grafana, pela rede interna', () => {
    const obsConfig = composeConfig('observability');
    // `expose: ['3200']` não vira `published` no render. Se alguém trocar por
    // `ports: ['3200:3200']` sem o prefixo de loopback, a API de busca do
    // Tempo (que expõe os índices de trace) passa a escutar em 0.0.0.0.
    //
    // O `.not.toBe('')` não é redundante: `blocoDoServico` devolve `''` para
    // serviço ausente, e `''.not.toMatch(...)` é `true` — sem esta linha o
    // teste passava justamente quando o serviço sumisse. CONFIRMADO por
    // mutação (`tempo:` → `tempo-store:`): sem ela este teste ficava VERDE.
    const bloco = blocoDoServico(obsConfig, 'tempo');
    expect(bloco).not.toBe('');
    expect(bloco).not.toMatch(/published:\s+"3200"/);
  });

  it('monta a config do Tempo read-only em /etc/tempo/tempo.yaml', () => {
    const obsConfig = composeConfig('observability');
    const bloco = blocoDoServico(obsConfig, 'tempo');
    expect(bloco).toMatch(/source:\s+\/.*infra\/tempo\/tempo\.yaml/);
    expect(bloco).toMatch(/target:\s+\/etc\/tempo\/tempo\.yaml/);
    expect(mountReadOnly(bloco, '/etc/tempo/tempo\\.yaml')).toBe(true);
  });
});
