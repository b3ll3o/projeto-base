// apps/api/src/shared/auth/decisao-do-admin-local.ts
//
// pt-BR (PR #115, achado 2 da revisão): extraída de `prisma/seed.ts`, onde a
// decisão vivia inline e sem spec — `apps/api/prisma/` não tem um único
// `*.spec.ts` e o projeto `unit` do Vitest só enxerga `src/`, então um spec ao
// lado do seed seria verde por nunca rodar.
//
// O que esta função decide: se o seed pode criar `admin@admin.com`, a conta de
// senha pública (`Admin@123`, no repositório) com TODAS as permissions e
// `isAdmin: true`, conectando como DONA — o papel que ignora RLS.
//
// ⚠️ TRÊS estados porque são três comportamentos, não dois. Um booleano
// `podeCriar` diria `false` para `recusar` e para `ignorar`, e a diferença é o
// exit code do seed inteiro: `ignorar` deixa o passo 5 seguir, `recusar` mata o
// processo. Colapsar os dois é o seed fechando "OK" sem admin nenhum em dev.

/** O que o seed faz com o admin local. */
export type DecisaoAdminLocal = 'criar' | 'recusar' | 'ignorar';

/**
 * Hostnames que contam como destino local.
 *
 * `postgres` NÃO é um host de loopback: é o nome do serviço do Compose, que é
 * o hostname que a `DIRECT_DATABASE_URL` tem de dentro do container. A
 * comparação é de STRING — o guard não resolve DNS, e é por isso que um
 * Postgres remoto de dev que se chame `postgres` passa, e que o
 * `projeto-base-postgres` (que resolve para o MESMO Postgres) é recusado.
 */
const HOSTS_DESTINO_LOCAL: readonly string[] = ['localhost', '127.0.0.1', 'postgres'];

/**
 * Modo default-deny: só `development` cria. Ausente, vazio, `staging`, `prod` ou
 * `Development` (o match é exato) saem por `ignorar` — o seed segue sem tocar em
 * usuário. Mesmo padrão do `JWT_SECRET` no ADR-0002.
 */
export function decisaoDoAdminLocal(nodeEnv: string | undefined, url: string): DecisaoAdminLocal {
  if (nodeEnv !== 'development') return 'ignorar';

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // Não parseou, logo não deu para verificar que é local: recusa. O seed real
    // não chega aqui — a primeira query (passo 1, `seed.ts:89`) morre antes com
    // `PrismaClientInitializationError`, MEDIDO. A recusa é o comportamento da
    // função pura, não uma mudança no seed.
    return 'recusar';
  }

  return HOSTS_DESTINO_LOCAL.includes(host) ? 'criar' : 'recusar';
}
