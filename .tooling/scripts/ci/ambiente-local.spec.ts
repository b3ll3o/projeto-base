import { describe, it, expect, vi } from 'vitest';
import { createServer, type Server } from 'node:net';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  decideSobreEnv,
  decideSobrePrismaClient,
  decideSobreBanco,
  decideSobrePorta,
  portaAberta,
  esperarPorta,
  alvoDoBanco,
  clienteDoPrismaGerado,
  temClientReal,
  publicaPortaNasBindings,
  inspecionarContainer,
  subirContainer,
  postgresPronto,
  EFEITOS_REAIS,
  verificarBanco,
  type EfeitosDoBanco,
  type VereditoAmbiente,
  CONTAINER_DO_BANCO_LOCAL,
} from './ambiente-local';

const RAIZ = resolve(__dirname, '..', '..', '..');
const SCRIPT = join(RAIZ, '.tooling', 'scripts', 'ci', 'ambiente-local.ts');

/**
 * Uma porta que ninguém está escutando.
 *
 * `TEST-NET-3` (RFC 5737, 198.51.100.0/24) é reservado para DOCUMENTAÇÃO e
 * nunca é roteável — é o alvo que FAZ FALHAR sem depender da máquina.
 */
const HOST_SEM_ROTA = '198.51.100.7';

/** Uma porta livre, medida na hora. */
async function portaLivre(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const servidor: Server = createServer();
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const endereco = servidor.address();
      if (endereco === null || typeof endereco === 'string') {
        servidor.close();
        reject(new Error('portaLivre(): endereço sem porta'));
        return;
      }
      const { port } = endereco;
      servidor.close(() => resolve(port));
    });
  });
}

/**
 * O veredito de FALHA, com narrow EXPLÍCITO.
 *
 * O `expect(...).toBe(false)` NÃO narrowa a união no TypeScript — o narrow
 * tem que ser do próprio código, e não da asserção.
 */
function falha(veredito: VereditoAmbiente): Extract<VereditoAmbiente, { ok: false }> {
  expect(veredito.ok).toBe(false);
  if (veredito.ok) throw new Error('esperava um veredito de falha');
  return veredito;
}

describe('decideSobreEnv', () => {
  it('sem DATABASE_URL e sem o arquivo: falha com o comando de cópia', () => {
    const veredito = decideSobreEnv({
      arquivoExiste: false,
      temDatabaseUrl: false,
      temSystemDatabaseUrl: true,
      ambiente: 'development',
      jwtSecret: 'segredo',
    });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).comando).toContain('cp apps/api/.env.example apps/api/.env');
  });

  it('sem DATABASE_URL, com o arquivo: falha nomeando a variável', () => {
    const veredito = decideSobreEnv({
      arquivoExiste: true,
      temDatabaseUrl: false,
      temSystemDatabaseUrl: true,
      ambiente: 'development',
      jwtSecret: 'segredo',
    });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).mensagem).toContain('DATABASE_URL');
  });

  it('sem JWT_SECRET: falha — a API recusa o boot sem ele', () => {
    const veredito = decideSobreEnv({
      arquivoExiste: true,
      temDatabaseUrl: true,
      temSystemDatabaseUrl: true,
      ambiente: 'development',
      jwtSecret: '   ',
    });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).mensagem).toContain('JWT_SECRET');
    expect(falha(veredito).comando).toContain('openssl rand');
  });

  it('sem SYSTEM_DATABASE_URL fora de development: falha (default-deny do #118)', () => {
    const veredito = decideSobreEnv({
      arquivoExiste: true,
      temDatabaseUrl: true,
      temSystemDatabaseUrl: false,
      ambiente: 'production',
      jwtSecret: 'segredo',
    });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).codigo).toBe('sem-system-database-url');
  });

  it('sem SYSTEM_DATABASE_URL em development: passa (o atalho é de development)', () => {
    const veredito = decideSobreEnv({
      arquivoExiste: true,
      temDatabaseUrl: true,
      temSystemDatabaseUrl: false,
      ambiente: 'development',
      jwtSecret: 'segredo',
    });

    expect(veredito.ok).toBe(true);
  });

  it('com as variáveis: passa', () => {
    const veredito = decideSobreEnv({
      arquivoExiste: true,
      temDatabaseUrl: true,
      temSystemDatabaseUrl: true,
      ambiente: 'development',
      jwtSecret: 'segredo-de-teste',
    });

    expect(veredito.ok).toBe(true);
  });

  it('NUNCA devolve o valor do JWT_SECRET na mensagem', () => {
    const veredito = decideSobreEnv({
      arquivoExiste: true,
      temDatabaseUrl: false,
      temSystemDatabaseUrl: true,
      ambiente: 'development',
      jwtSecret: 'segredo-super-secreto',
    });

    expect(falha(veredito).mensagem).not.toContain('segredo-super-secreto');
  });
});

describe('decideSobrePrismaClient', () => {
  it('sem o client gerado: falha com o comando do db:generate (com --force)', () => {
    const veredito = decideSobrePrismaClient({ clienteGerado: false });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).comando).toContain('db:generate');
    expect(falha(veredito).comando).toContain('--force');
    // O sintoma do STUB — não o do client ausente.
    expect(falha(veredito).mensagem).toContain('did not initialize yet');
  });

  it('com o client gerado: passa', () => {
    expect(decideSobrePrismaClient({ clienteGerado: true }).ok).toBe(true);
  });
});

describe('decideSobreBanco', () => {
  const base = {
    bancoAlcancavel: false,
    host: 'localhost',
    porta: 5432,
    containerExiste: true,
    containerParado: true,
    containerPublicaPorta: true,
    imagem: 'postgres:16-alpine',
  };

  it('banco no ar: passa', () => {
    const veredito = decideSobreBanco({ ...base, bancoAlcancavel: true });

    expect(veredito.ok).toBe(true);
    expect(veredito.mensagem).toContain('5432');
  });

  it('container PARADO: manda religá-lo — e NUNCA manda recriá-lo', () => {
    const veredito = decideSobreBanco(base);

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).codigo).toBe('subir-container');
    expect(falha(veredito).comando).toBe(`docker start ${CONTAINER_DO_BANCO_LOCAL}`);
    expect(falha(veredito).comando).not.toContain('docker run');
  });

  it('container PARADO com imagem que NÃO é do Postgres: não o religa', () => {
    const veredito = decideSobreBanco({ ...base, imagem: 'outra-imagem:1' });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).codigo).toBe('container-imagem-inesperada');
    expect(falha(veredito).comando).not.toContain('docker start');
  });

  it('container inexistente: aponta o runbook, sem inventar comando de criação', () => {
    const veredito = decideSobreBanco({ ...base, containerExiste: false });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).codigo).toBe('sem-container');
    expect(falha(veredito).mensagem).toContain('§1.1');
    expect(falha(veredito).comando).toBeUndefined();
  });

  it('container que não publica a porta: diz isso', () => {
    const veredito = decideSobreBanco({ ...base, containerPublicaPorta: false });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).codigo).toBe('container-sem-porta');
  });

  it('alvo NÃO local: não recomenda o container local', () => {
    const veredito = decideSobreBanco({ ...base, host: 'postgres' });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).codigo).toBe('banco-remoto');
    expect(falha(veredito).comando).toBeUndefined();
  });

  it('container DE PÉ que publica a porta e mesmo assim não responde: a mensagem NÃO diz que ele não publica a porta', () => {
    const veredito = decideSobreBanco({ ...base, containerParado: false });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).codigo).toBe('banco-mudo');
    // A porta que ele publica É a sondada — a mensagem não pode afirmar o
    // contrário (afirmação invertida por construção).
    expect(falha(veredito).mensagem).toContain(`publica a porta ${base.porta}`);
    // ⚠️ Case-INSENSITIVE: a negação em português ("não publica") e a
    // afirmação ("publica a porta") se sobrepõem em caixa — um
    // `not.toContain('não publica')` NÃO pega a mensagem que diz "NÃO
    // publica", e a mutação passava verde.
    expect(falha(veredito).mensagem).not.toMatch(/não publica/i);
  });

  it('IPv6 local com colchetes é local (o hostname do WHATWG devolve `[::1]`)', () => {
    const veredito = decideSobreBanco({ ...base, host: '[::1]' });

    expect(falha(veredito).codigo).toBe('subir-container');
  });

  it('host em CAIXA ALTA é local (o WHATWG não normaliza a caixa no esquema não-especial)', () => {
    const veredito = decideSobreBanco({ ...base, host: 'LOCALHOST' });

    expect(falha(veredito).codigo).toBe('subir-container');
  });
});

describe('temClientReal', () => {
  it('o STUB do postinstall (só `default.js`) NÃO passa — ele lança ao ser importado', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prisma-stub-'));
    writeFileSync(join(dir, 'default.js'), 'throw new Error("did not initialize yet");');

    expect(temClientReal(dir)).toBe(false);
  });

  it('o client REAL (`schema.prisma` + `client.js`) passa', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prisma-real-'));
    writeFileSync(join(dir, 'default.js'), '// real');
    writeFileSync(join(dir, 'client.js'), '// real');
    writeFileSync(join(dir, 'schema.prisma'), '// real');

    expect(temClientReal(dir)).toBe(true);
  });

  it('um diretório vazio NÃO passa', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prisma-vazio-'));

    expect(temClientReal(dir)).toBe(false);
  });

  it('o client do repo REAL: a medição bate com o que o postinstall deixou', () => {
    // Neste repo o client está gerado — e o veredito tem que ser o do client
    // REAL, não o do stub.
    expect(clienteDoPrismaGerado()).toBe(true);
  });
});

describe('decideSobrePorta', () => {
  it('porta livre: passa', () => {
    expect(decideSobrePorta({ porta: 3000, ocupada: false, containersNaPorta: [] }).ok).toBe(true);
  });

  it('porta ocupada por container do Compose: dá `docker compose stop <serviço>`', () => {
    const veredito = decideSobrePorta({
      porta: 3000,
      ocupada: true,
      containersNaPorta: [{ nome: 'projeto-base-api', servicoCompose: 'api' }],
    });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).codigo).toBe('porta-no-container');
    expect(falha(veredito).mensagem).toContain('projeto-base-api');
    expect(falha(veredito).comando).toBe('docker compose stop api');
  });

  it('porta ocupada por container que NÃO é do Compose: dá `docker stop <container>`', () => {
    const veredito = decideSobrePorta({
      porta: 3000,
      ocupada: true,
      containersNaPorta: [{ nome: 'outro-container', servicoCompose: undefined }],
    });

    expect(falha(veredito).comando).toBe('docker stop outro-container');
  });

  it('porta ocupada por processo local: NÃO sugere pkill (este repo é copiado)', () => {
    const veredito = decideSobrePorta({ porta: 3000, ocupada: true, containersNaPorta: [] });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).codigo).toBe('porta-no-processo');
    expect(falha(veredito).comando).not.toContain('pkill');
    expect(falha(veredito).comando).toContain('ss -ltnp');
  });
});

describe('alvoDoBanco', () => {
  it('lê host e porta, e NUNCA devolve a credencial', () => {
    const alvo = alvoDoBanco(
      'postgresql://app_runtime:senha-secreta@localhost:5432/projeto_base?schema=public',
    );

    expect(alvo).toEqual({ host: 'localhost', porta: 5432 });
    expect(JSON.stringify(alvo)).not.toContain('senha-secreta');
  });

  it('porta ausente: assume a 5432', () => {
    expect(alvoDoBanco('postgresql://app_runtime:x@localhost/db')).toEqual({
      host: 'localhost',
      porta: 5432,
    });
  });

  it('URI inválida ou ausente: undefined (e NENHUM erro)', () => {
    expect(alvoDoBanco('não é uma uri')).toBeUndefined();
    expect(alvoDoBanco(undefined)).toBeUndefined();
  });
});

describe('publicaPortaNasBindings', () => {
  it('publica a porta quando o HostPort é a porta sondada', () => {
    const bindings = '{"5432/tcp":[{"HostIp":"","HostPort":"5432"}]}';

    expect(publicaPortaNasBindings(bindings, 5432)).toBe(true);
  });

  it('com porta do HOST diferente da do CONTAINER, decide pelo HostPort', () => {
    // `-p 55432:5432` → chave "5432/tcp" (container), HostPort "55432" (host).
    const bindings = '{"5432/tcp":[{"HostIp":"","HostPort":"55432"}]}';

    expect(publicaPortaNasBindings(bindings, 55432)).toBe(true);
    expect(publicaPortaNasBindings(bindings, 5432)).toBe(false);
  });

  it('binding nulo (o caso do #91): não publica', () => {
    expect(publicaPortaNasBindings('{"5432/tcp":null}', 5432)).toBe(false);
  });

  it('sem bindings, JSON inválido ou indefinido: não publica', () => {
    expect(publicaPortaNasBindings('{}', 5432)).toBe(false);
    expect(publicaPortaNasBindings('não é json', 5432)).toBe(false);
    expect(publicaPortaNasBindings(undefined, 5432)).toBe(false);
  });

  it('JSON que não é objeto: não publica', () => {
    expect(publicaPortaNasBindings('null', 5432)).toBe(false);
    expect(publicaPortaNasBindings('[]', 5432)).toBe(false);
  });
});

describe('portaAberta e esperarPorta', () => {
  it('uma porta com servidor responde true', async () => {
    const porta = await portaLivre();
    const servidor = createServer();
    await new Promise<void>((resolve) => servidor.listen(porta, '127.0.0.1', resolve));

    expect(await portaAberta('127.0.0.1', porta)).toBe(true);

    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  });

  it('uma porta sem servidor responde false', async () => {
    const porta = await portaLivre();

    expect(await portaAberta('127.0.0.1', porta)).toBe(false);
  });

  it('esperarPorta TRUE quando o servidor aparece durante a espera', async () => {
    const porta = await portaLivre();
    const servidor = createServer();
    setTimeout(() => servidor.listen(porta, '127.0.0.1'), 300);

    expect(await esperarPorta('127.0.0.1', porta, 5_000)).toBe(true);

    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  });

  it('esperarPorta FALSE quando nada aparece no prazo', async () => {
    const porta = await portaLivre();

    expect(await esperarPorta('127.0.0.1', porta, 600)).toBe(false);
  });
});

describe('os efeitos reais (sem container nenhum)', () => {
  // Um nome que não existe: o `docker` responde "no such object" (exit != 0) e
  // o efeito devolve o negativo. ⚠️ Se o Docker NÃO estiver instalado, o
  // `execFileSync` LANÇA — e o `catch` devolve o mesmo negativo. As duas specs
  // passam com e sem Docker, que é o que permite rodá-las no CI.
  const INEXISTENTE = 'container-que-nao-existe-projeto-base';

  it('inspecionarContainer de um container inexistente: existe=false', () => {
    const estado = inspecionarContainer(INEXISTENTE, 5432);

    expect(estado.existe).toBe(false);
    expect(estado.rodando).toBe(false);
    expect(estado.publicaPorta).toBe(false);
    expect(estado.imagem).toBeUndefined();
  });

  it('subirContainer de um container inexistente: devolve false (e não sobe nada)', () => {
    expect(subirContainer(INEXISTENTE)).toBe(false);
  });

  it('postgresPronto de um container inexistente: devolve false', () => {
    expect(postgresPronto(INEXISTENTE)).toBe(false);
  });
});

// ── a auto-recuperação (a feature-cabeçalho) ────────────────────────────────

/** Os efeitos falsos — o container é simulado, nenhum Docker é tocado. */
function efeitosFalsos(sobrescritas: Partial<EfeitosDoBanco> = {}): EfeitosDoBanco {
  return {
    portaAberta: async () => false,
    inspecionarContainer: () => ({
      existe: true,
      rodando: false,
      publicaPorta: true,
      imagem: 'postgres:16-alpine',
    }),
    subirContainer: () => true,
    esperarPorta: async () => true,
    esperarPostgresPronto: async () => true,
    ...sobrescritas,
  };
}

const URL_LOCAL = 'postgresql://app_runtime:x@localhost:5432/db';

describe('a auto-recuperação (verificarBanco)', () => {
  it('container PARADO: religa e segue — e o `docker start` É chamado', async () => {
    const subir = vi.fn(() => true);
    const efeitos = efeitosFalsos({ subirContainer: subir });

    const { ok, veredito } = await verificarBanco({ DATABASE_URL: URL_LOCAL }, efeitos);

    expect(subir).toHaveBeenCalledWith(CONTAINER_DO_BANCO_LOCAL);
    expect(ok).toBe(true);
    expect(veredito.mensagem).toContain('container religado');
  });

  it('o `docker start` que FALHA: diz que o container não subiu', async () => {
    const efeitos = efeitosFalsos({ subirContainer: () => false });

    const { ok, veredito } = await verificarBanco({ DATABASE_URL: URL_LOCAL }, efeitos);

    expect(ok).toBe(false);
    expect(falha(veredito).codigo).toBe('container-nao-subiu');
  });

  it('a porta que NÃO abre depois do start: diz que a porta não respondeu', async () => {
    const efeitos = efeitosFalsos({ esperarPorta: async () => false });

    const { ok, veredito } = await verificarBanco({ DATABASE_URL: URL_LOCAL }, efeitos);

    expect(ok).toBe(false);
    expect(falha(veredito).codigo).toBe('container-sem-resposta');
    expect(falha(veredito).mensagem).toContain('não respondeu');
  });

  it('a porta que abre mas o Postgres NÃO fica pronto: diz que o banco não ficou pronto', async () => {
    const efeitos = efeitosFalsos({ esperarPostgresPronto: async () => false });

    const { ok, veredito } = await verificarBanco({ DATABASE_URL: URL_LOCAL }, efeitos);

    expect(ok).toBe(false);
    expect(falha(veredito).codigo).toBe('container-sem-resposta');
    expect(falha(veredito).mensagem).toContain('não ficou pronto');
  });

  it('banco já no ar: o `docker start` NÃO é chamado (o atalho não dispara sem precisar)', async () => {
    const subir = vi.fn(() => true);
    const efeitos = efeitosFalsos({ portaAberta: async () => true, subirContainer: subir });

    const { ok } = await verificarBanco({ DATABASE_URL: URL_LOCAL }, efeitos);

    expect(ok).toBe(true);
    expect(subir).not.toHaveBeenCalled();
  });

  it('container que não é do Postgres: o `docker start` NÃO é chamado', async () => {
    const subir = vi.fn(() => true);
    const efeitos = efeitosFalsos({
      inspecionarContainer: () => ({
        existe: true,
        rodando: false,
        publicaPorta: true,
        imagem: 'outra-imagem:1',
      }),
      subirContainer: subir,
    });

    const { ok, veredito } = await verificarBanco({ DATABASE_URL: URL_LOCAL }, efeitos);

    expect(ok).toBe(false);
    expect(falha(veredito).codigo).toBe('container-imagem-inesperada');
    expect(subir).not.toHaveBeenCalled();
  });

  it('DATABASE_URL ausente: diz que não há URL (não "que a URL é inválida")', async () => {
    const { ok, veredito } = await verificarBanco({}, efeitosFalsos());

    expect(ok).toBe(false);
    expect(falha(veredito).codigo).toBe('sem-database-url');
  });

  it('DATABASE_URL INVÁLIDA: diz que a URL é inválida (não que ela falta)', async () => {
    const { ok, veredito } = await verificarBanco(
      { DATABASE_URL: 'postgresql://u:p@h:notaporta/db' },
      efeitosFalsos(),
    );

    expect(ok).toBe(false);
    expect(falha(veredito).codigo).toBe('database-url-invalida');
  });
});

describe('a recuperação com os efeitos REAIS (docker falso no PATH)', () => {
  /**
   * Um `docker` FALSO no PATH.
   *
   * As specs com efeitos injetados provam os RAMOS; esta prova que o
   * CAMINHO REAL (a decisão + o `execFileSync` de verdade + a espera) religa
   * o container. Sem ela, mutar o `subirContainer` de verdade para `return
   * false` deixaria a suíte VERDE — que é o achado M-03.
   *
   * O falso é um script `sh` que responde o que o Docker responderia, e
   * **registra cada chamada** num log — assim a spec afirma que o
   * `docker start` aconteceu, e não apenas que o veredito ficou verde.
   */
  function dockerFalso(porta: number): { dir: string; log: string } {
    const dir = mkdtempSync(join(tmpdir(), 'ambiente-fake-docker-'));
    const log = join(dir, 'chamadas.log');
    const script = `#!/bin/sh
echo "$@" >> "$FAKE_DOCKER_LOG"
case "$1" in
  inspect)
    case "$3" in
      "{{.State.Status}}") echo "exited" ;;
      "{{json .HostConfig.PortBindings}}") echo '{"5432/tcp":[{"HostIp":"","HostPort":"${porta}"}]}' ;;
      "{{.Config.Image}}") echo "postgres:16-alpine" ;;
      *) echo "" ;;
    esac
    ;;
  start|exec) exit 0 ;;
  ps) echo "" ;;
esac
exit 0
`;
    const caminho = join(dir, 'docker');
    writeFileSync(caminho, script);
    chmodSync(caminho, 0o755);
    return { dir, log };
  }

  it('container PARADO: o caminho real religa, chama o `docker start` e volta verde', async () => {
    const porta = await portaLivre();
    const servidor = createServer();
    // ⚠️ O servidor só começa a escutar DEPOIS da primeira sondagem: o
    // caminho da recuperação exige a porta FECHADA no probe (o banco "não
    // responde") e ABERTA depois do `docker start`. Com o servidor no ar
    // desde o começo, o banco pareceria no ar e a recuperação nem rodaria.
    setTimeout(() => servidor.listen(porta, '127.0.0.1'), 600);

    const falso = dockerFalso(porta);
    const pathOriginal = process.env['PATH'];
    process.env['PATH'] = `${falso.dir}${pathOriginal === undefined ? '' : `:${pathOriginal}`}`;
    process.env['FAKE_DOCKER_LOG'] = falso.log;

    try {
      const { ok, veredito } = await verificarBanco(
        { DATABASE_URL: `postgresql://app_runtime:x@127.0.0.1:${porta}/db` },
        EFEITOS_REAIS,
      );

      expect(ok).toBe(true);
      expect(veredito.mensagem).toContain('container religado');
      // A PROVA: o `docker start` foi de fato chamado (e não um atalho).
      expect(existsSync(falso.log)).toBe(true);
      expect(readFileSync(falso.log, 'utf-8')).toContain('start');
    } finally {
      process.env['PATH'] = pathOriginal;
      delete process.env['FAKE_DOCKER_LOG'];
      await new Promise<void>((resolve) => servidor.close(() => resolve()));
    }
  });
});

// ── o SCRIPT (o teste local de verdade) ──────────────────────────────────────

describe('o script ambiente-local', () => {
  /**
   * O ambiente das specs do SCRIPT — TODO declarado aqui.
   *
   * ⚠️ MEDIDO em 2026-11-03 (no CI): a spec passava na máquina e falhava no
   * runner. A causa: `SYSTEM_DATABASE_URL` e `NODE_ENV` NÃO vinham da spec —
   * vinham do `apps/api/.env` da máquina (que tem `NODE_ENV=development` e a
   * variável), e o CI não tem esse arquivo. O `decideSobreEnv` exigia o
   * `SYSTEM_DATABASE_URL` fora de `development` → no CI o script saía 1.
   *
   * A spec que depende do estado da MÁQUINA é uma spec que mede a máquina, não
   * o código. Tudo que o script lê é declarado aqui.
   */
  const AMBIENTE_DA_SPEC = {
    NODE_ENV: 'development',
    DATABASE_URL: '',
    SYSTEM_DATABASE_URL: 'postgresql://app_system:x@127.0.0.1:5432/db',
    JWT_SECRET: 'segredo-de-teste-com-tamanho-suficiente-1234',
    PORT: '',
  };
  it('com o banco inalcançável: sai com 1 e nomeia o DIAGNÓSTICO (não um "não responde" genérico)', async () => {
    const portaDaApi = await portaLivre();
    const resultado = spawnSync('pnpm', ['exec', 'tsx', SCRIPT], {
      cwd: RAIZ,
      encoding: 'utf-8',
      timeout: 60_000,
      env: {
        ...process.env,
        ...AMBIENTE_DA_SPEC,
        DATABASE_URL: `postgresql://app_runtime:x@${HOST_SEM_ROTA}:5432/db`,
        PORT: String(portaDaApi),
      },
    });

    const saida = `${resultado.stdout}${resultado.stderr}`;
    expect(resultado.status).toBe(1);
    // O diagnóstico é "banco-remoto" — e a asserção fixa a PALAVRA do
    // diagnóstico, não uma substring que aparece em cinco mensagens.
    expect(saida).toContain('O alvo não é local');
    expect(saida).not.toContain('não existe');
    expect(saida).not.toContain('NÃO publica a porta');
    // E o script NÃO mexeu em container nenhum.
    expect(saida).not.toContain('docker start');
  });

  it('com o banco no ar e a porta livre: as asserções de banco e porta passam', async () => {
    const portaDoBanco = await portaLivre();
    const portaDaApi = await portaLivre();
    const servidor = createServer();
    await new Promise<void>((resolve) => servidor.listen(portaDoBanco, '127.0.0.1', resolve));

    const resultado = spawnSync('pnpm', ['exec', 'tsx', SCRIPT], {
      cwd: RAIZ,
      encoding: 'utf-8',
      timeout: 60_000,
      env: {
        ...process.env,
        ...AMBIENTE_DA_SPEC,
        DATABASE_URL: `postgresql://app_runtime:x@127.0.0.1:${portaDoBanco}/db`,
        PORT: String(portaDaApi),
      },
    });

    await new Promise<void>((resolve) => servidor.close(() => resolve()));

    const saida = `${resultado.stdout}${resultado.stderr}`;
    expect(saida).toContain('✓ banco local');
    expect(saida).toContain(`✓ porta da API (:${portaDaApi})`);

    // O código de saída também depende do Prisma Client: num clone novo, sem
    // `db:generate`, a asserção do client reprova e o script sai 1 — e isso
    // não é o que esta spec mede.
    if (clienteDoPrismaGerado()) {
      expect(resultado.status).toBe(0);
    } else {
      expect(resultado.status).toBe(1);
      expect(saida).toContain('Prisma Client');
    }
  });

  it('sem JWT_SECRET: sai com 1 e aponta o comando do segredo', async () => {
    const portaDaApi = await portaLivre();
    const resultado = spawnSync('pnpm', ['exec', 'tsx', SCRIPT], {
      cwd: RAIZ,
      encoding: 'utf-8',
      timeout: 60_000,
      env: {
        ...process.env,
        ...AMBIENTE_DA_SPEC,
        DATABASE_URL: `postgresql://app_runtime:x@${HOST_SEM_ROTA}:5432/db`,
        JWT_SECRET: '',
        PORT: String(portaDaApi),
      },
    });

    const saida = `${resultado.stdout}${resultado.stderr}`;
    expect(resultado.status).toBe(1);
    expect(saida).toContain('JWT_SECRET');
    expect(saida).toContain('openssl rand');
  });

  it('com PORT fora da faixa: sai com 1 e NAO estoura o erro cru do Node', async () => {
    const resultado = spawnSync('pnpm', ['exec', 'tsx', SCRIPT], {
      cwd: RAIZ,
      encoding: 'utf-8',
      timeout: 60_000,
      env: {
        ...process.env,
        ...AMBIENTE_DA_SPEC,
        DATABASE_URL: `postgresql://app_runtime:x@${HOST_SEM_ROTA}:5432/db`,
        PORT: '99999',
      },
    });

    const saida = `${resultado.stdout}${resultado.stderr}`;
    expect(resultado.status).toBe(1);
    expect(saida).toContain('não é uma porta válida');
    expect(saida).not.toContain('Port should be >= 0');
  });
});
