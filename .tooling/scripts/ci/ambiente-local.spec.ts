import { describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:net';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import {
  decideSobreEnv,
  decideSobrePrismaClient,
  decideSobreBanco,
  decideSobrePorta,
  portaAberta,
  alvoDoBanco,
  clienteDoPrismaGerado,
  publicaPortaNasBindings,
  CONTAINER_DO_BANCO_LOCAL,
  type VereditoAmbiente,
} from './ambiente-local';

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

const RAIZ = resolve(__dirname, '..', '..', '..');
const SCRIPT = join(RAIZ, '.tooling', 'scripts', 'ci', 'ambiente-local.ts');

/**
 * Uma porta que ninguém está escutando.
 *
 * `TEST-NET-3` (RFC 5737, 198.51.100.0/24) é reservado para DOCUMENTAÇÃO e
 * nunca é roteável — é o alvo que FAZ FALHAR sem depender da máquina.
 */
const HOST_SEM_ROTA = '198.51.100.7';

/** Uma porta livre, medida na hora — é o que a spec usa para o caminho "feliz". */
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
});

describe('decideSobreEnv', () => {
  it('sem DATABASE_URL e sem o arquivo: falha com o comando de cópia', () => {
    const veredito = decideSobreEnv({
      arquivoExiste: false,
      temDatabaseUrl: false,
      jwtSecret: 'segredo',
    });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).comando).toContain('cp apps/api/.env.example apps/api/.env');
  });

  it('sem DATABASE_URL, com o arquivo: falha nomeando a variável', () => {
    const veredito = decideSobreEnv({
      arquivoExiste: true,
      temDatabaseUrl: false,
      jwtSecret: 'segredo',
    });

    expect(veredito.ok).toBe(false);
    expect(veredito.mensagem).toContain('DATABASE_URL');
  });

  it('sem JWT_SECRET: falha — a API recusa o boot sem ele', () => {
    const veredito = decideSobreEnv({
      arquivoExiste: true,
      temDatabaseUrl: true,
      jwtSecret: '   ',
    });

    expect(veredito.ok).toBe(false);
    expect(veredito.mensagem).toContain('JWT_SECRET');
    expect(falha(veredito).comando).toContain('openssl rand');
  });

  it('com as duas variáveis: passa', () => {
    const veredito = decideSobreEnv({
      arquivoExiste: true,
      temDatabaseUrl: true,
      jwtSecret: 'segredo-de-teste',
    });

    expect(veredito.ok).toBe(true);
  });

  it('NUNCA devolve o valor do JWT_SECRET na mensagem', () => {
    const veredito = decideSobreEnv({
      arquivoExiste: true,
      temDatabaseUrl: false,
      jwtSecret: 'segredo-super-secreto',
    });

    expect(veredito.mensagem).not.toContain('segredo-super-secreto');
  });
});

describe('decideSobrePrismaClient', () => {
  it('sem o client gerado: falha com o comando do db:generate (com --force)', () => {
    const veredito = decideSobrePrismaClient({ clienteGerado: false });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).comando).toContain('db:generate');
    expect(falha(veredito).comando).toContain('--force');
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

  it('container que NÃO é do Postgres: não manda mexer nele', () => {
    const veredito = decideSobreBanco({ ...base, imagem: 'outra-imagem:1' });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).codigo).not.toBe('subir-container');
    expect(falha(veredito).comando).toBeUndefined();
  });

  it('container inexistente: aponta o runbook, sem inventar comando de criação', () => {
    const veredito = decideSobreBanco({ ...base, containerExiste: false });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).codigo).toBe('sem-container');
    expect(veredito.mensagem).toContain('§1.1');
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
});

describe('decideSobrePorta', () => {
  it('porta livre: passa', () => {
    expect(decideSobrePorta({ porta: 3000, ocupada: false, containersNaPorta: [] }).ok).toBe(true);
  });

  it('porta ocupada por container: nomeia o dono e dá os DOIS comandos', () => {
    const veredito = decideSobrePorta({
      porta: 3000,
      ocupada: true,
      containersNaPorta: ['projeto-base-api'],
    });

    expect(veredito.ok).toBe(false);
    expect(veredito.mensagem).toContain('projeto-base-api');
    expect(falha(veredito).comando).toContain('docker compose stop api');
    expect(falha(veredito).comando).toContain('docker stop projeto-base-api');
  });

  it('porta ocupada por processo local: dá o pkill', () => {
    const veredito = decideSobrePorta({ porta: 3000, ocupada: true, containersNaPorta: [] });

    expect(veredito.ok).toBe(false);
    expect(falha(veredito).comando).toContain('pkill');
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

describe('portaAberta', () => {
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
});

// ── o SCRIPT (o teste local de verdade) ──────────────────────────────────────

describe('o script ambiente-local', () => {
  it('com o banco inalcançável: sai com 1 e diz o que falta', () => {
    const resultado = spawnSync('pnpm', ['exec', 'tsx', SCRIPT], {
      cwd: RAIZ,
      encoding: 'utf-8',
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://app_runtime:x@${HOST_SEM_ROTA}:5432/db`,
        JWT_SECRET: 'segredo-de-teste-com-tamanho-suficiente-1234',
        PORT: '3000',
      },
    });

    const saida = `${resultado.stdout}${resultado.stderr}`;
    expect(resultado.status).toBe(1);
    expect(saida).toContain('não responde');
    // O alvo sem rota NÃO é local → o script não manda mexer no container.
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
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://app_runtime:x@127.0.0.1:${portaDoBanco}/db`,
        JWT_SECRET: 'segredo-de-teste-com-tamanho-suficiente-1234',
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

  it('sem JWT_SECRET: sai com 1 e aponta o comando do segredo', () => {
    const resultado = spawnSync('pnpm', ['exec', 'tsx', SCRIPT], {
      cwd: RAIZ,
      encoding: 'utf-8',
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://app_runtime:x@${HOST_SEM_ROTA}:5432/db`,
        JWT_SECRET: '',
        PORT: '3000',
      },
    });

    const saida = `${resultado.stdout}${resultado.stderr}`;
    expect(resultado.status).toBe(1);
    expect(saida).toContain('JWT_SECRET');
    expect(saida).toContain('openssl rand');
  });
});
