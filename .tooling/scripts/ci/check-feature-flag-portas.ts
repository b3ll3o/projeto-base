// .tooling/scripts/ci/check-feature-flag-portas.ts
//
// A paridade entre a LISTA de portas de uma chave de feature flag (contrato
// HTTP, §8.1) e o CÓDIGO que realmente tranca essas portas.
//
// ## O furo que este gate fecha (pt-BR #110, 2026-10-19)
//
// `FeatureFlagGuard` passa quando o requisito está ausente — o mesmo "sem
// requisito = passa" do `PermissionsGuard`, e por um bom motivo. O efeito
// colateral é que **esquecer o decorator não desliga nada**: a rota nova nasce
// ligada, o preflight fica verde, e a documentação continua descrevendo o que
// o código não faz.
//
// MEDIDO na revisão do PR #109: `tenancy.invites` tem TRÊS portas e as três
// estão fechadas — mas foram fechadas à mão, por revisão. Nada no repo impede a
// quarta. `check-feature-flag-contract` compara catálogo ↔ contrato e **não olha
// código**: uma rota que consome a funcionalidade e não usa nada de flag não
// aparece em nenhum dos dois conjuntos que ele percorre.
//
// ## O que este gate NÃO promete
//
// Detectar "esta rota CONSOME a funcionalidade" por regex não é confiável — a
// terceira porta lê `body.destino?.tipo === 'convite'`, que não é o nome da
// chave nem o do recurso. Este gate exige **declaração** e confere a paridade
// declarado ↔ código. Ele pega **a porta esquecida de declarar**, que é o modo
// de falha real, e não promete inferir consumo indireto, que exigiria análise
// de fluxo. O contrato §8.1 repete esse limite para quem for ler o gate.
//
// ## Os dois sentidos, porque um só não fecha
//
//  - **porta listada que não existe no código** → o contrato envelheceu, e o
//    gate que应该说 "a rota trancada" está trancando uma rota que saiu.
//  - **controller que MENcionA a chave e não está na lista** → a porta foi
//    aberta e ninguém declarou. Este é o sentido que pega a quarta porta.
//
// ⚠️ A "menção" é do **uso**, não da string: um arquivo com a chave escrita
// em comentário passa, e o código removido também. Por isso a regex abaixo
// exige a chave dentro de uma CHAMADA (`@RequireFeatureFlag('…')` ou
// `chaveDesligada(…, '…')`) ou de uma entrada da lista, e o controller tem que
// conter o decorator de rota que a lista nomeia.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface PortaDeclarada {
  chave: string;
  rota: string;
  mecanismo: 'decorator' | 'inline';
  controller: string;
}

export interface ResultadoFeatureFlagPortas {
  ok: boolean;
  errors: string[];
  advisories: string[];
}

const CONTRATO = 'docs/superpowers/specs/2026-10-18-feature-flags-contrato-http.md';
const RAIZ_CONTROLLERS = 'apps/api/src/modules';

/**
 * O bloco `portas:` do contrato.
 *
 * ⚠️ Ancorado em LINHA INTEIRA e não em `indexOf` solto: MEDIDO 2026-10-19, a
 * busca ingenua casou a PALAVRA "portas" dentro da `descricao` de §4
 * ("Desligar tranca as três portas: …") e devolveu 0 entradas — o gate
 * acusou "nenhuma porta declarada" com a lista perfeitamente escrita no
 * documento, e a pessoa ia procurar um defeito no contrato que não existe.
 */
const RE_BLOCO_PORTAS = /^portas:\s*$/m;
/** Entrada da lista: `- rota: POST /tenants/:id/invitations` */
const RE_ENTRADA = /-\s*rota:\s*(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/g;
/** `mecanismo: decorator` / `inline` logo abaixo da entrada. */
const RE_MECANISMO = /-\s*rota:[^\n]*\n\s*mecanismo:\s*(decorator|inline)/g;
/** `controller: arquivo.ts` */
const RE_CONTROLLER = /-\s*rota:[^\n]*\n(?:\s*mecanismo:[^\n]*\n)?\s*controller:\s*(\S+)/g;
/** A chave dona do bloco inteiro — vem do `chave:` mais próximo acima de `portas:`. */
const RE_CHAVE_BLOCO = /-\s*rota:/;

/** `@RequireFeatureFlag('tenancy.invites', …)` — a chave como ARGUMENTO. */
const RE_USO_DECORATOR = /@RequireFeatureFlag\(\s*'([^']+)'/g;
/** `chaveDesligada(porto, 'tenancy.invites')` — a porta inline. */
const RE_USO_INLINE = /chaveDesligada\(\s*[^,]+,\s*'([^']+)'/g;
/**
 * `@Post('tenants/:id/invitations')` — o decorator de rota, literal.
 *
 * ⚠️ ANCORADO EM INÍCIO DE LINHA. MEDIDO 2026-10-19: sem o `^`, o
 * `users.controller.ts:131` — que fala de `@Post` em comentário — virava uma
 * rota do controller, e o gate passou a enxergar uma porta que não existe. Com
 * o anchor, comentário não é decorator.
 */
const RE_DECORATOR_ROTA = /^[ \t]*@(Get|Post|Put|Patch|Delete)\(\s*'([^']*)'\s*\)/gm;
/** `@Post()` sem path — a rota raiz do controller. */
const RE_DECORATOR_ROTA_VAZIA = /^[ \t]*@(Get|Post|Put|Patch|Delete)\(\s*\)/gm;

/** Só o nome do arquivo: `tenancy-invitations.controller.ts`. */
function nomeDe(caminho: string): string {
  return caminho.split('/').pop() ?? caminho;
}

/** Todos os `.controller.ts` sob `apps/api/src/modules`. */
export function controllersEm(raiz: string): string[] {
  const out: string[] = [];
  const base = resolve(raiz, RAIZ_CONTROLLERS);
  if (!existsSync(base)) return out;
  const anda = (dir: string): void => {
    for (const entrada of readdirSync(dir)) {
      const p = join(dir, entrada);
      if (statSync(p).isDirectory()) anda(p);
      else if (entrada.endsWith('.controller.ts')) out.push(p);
    }
  };
  anda(base);
  return out;
}

/** O bloco `portas:` do contrato, com a chave dona de cada entrada. */
export function parsearPortas(contrato: string): PortaDeclarada[] {
  const achado = RE_BLOCO_PORTAS.exec(contrato);
  if (achado === null) return [];
  const i = achado.index;

  // O bloco vai até a próxima linha que começa com `#` de fora do fence, ou
  // até o fim. O fence ``` e as tabelas do §8.1 contêm `#` em quase nada, e o
  // limite por `## ` é o que segura.
  const resto = contrato.slice(i);
  const fim = resto.search(/\n##\s/);
  const bloco = fim < 0 ? resto : resto.slice(0, fim);

  // A chave dona é a última chave do CATÁLOGO citada antes do bloco — no
  // contrato a lista vive logo abaixo da prosa que nomeia a chave.
  const chaves = [...contrato.slice(0, i).matchAll(/"chave"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  // `string | undefined`: o bloco `portas:` sem chave dona é um contrato
  // malformado, e o chamador acusa. Aqui só não deixa o `undefined` vazar.
  const chave = chaves[chaves.length - 1] ?? '';

  // As entradas: cada `- rota:` pega os campos das 2 linhas seguintes.
  const entradas = [...bloco.matchAll(RE_ENTRADA)];
  const mecanismos = [...bloco.matchAll(RE_MECANISMO)];
  const controllers = [...bloco.matchAll(RE_CONTROLLER)];

  return entradas.map((m, idx) => ({
    chave,
    // O regex garante os dois grupos; o `??` é para o `noUncheckedIndexedAccess`
    // do repo, e o fallback nunca acontece em runtime.
    rota: `${(m[1] ?? '').toUpperCase()} ${m[2] ?? ''}`,
    mecanismo: (mecanismos[idx]?.[1] ?? 'decorator') as 'decorator' | 'inline',
    controller: controllers[idx]?.[1] ?? '',
  }));
}

/**
 * Esta rota tranca a CHAVE? A janela é o trecho entre o decorator de rota e o
 * decorator ANTERIOR (ou o começo do arquivo): `@RequireFeatureFlag` vem
 * ACIMA do `@Post` no código, e uma chave de outra rota acima não pode
 * contaminar esta.
 *
 * É o que separa "esta rota depende da flag" de "este arquivo menciona a flag".
 */
export function rotaTrancaComAChave(texto: string, rota: string, chave: string): boolean {
  // ⚠️ `rota` chega como `POST /tenants/:id/invitations` — MAIÚSCULO, porque é a
  // forma normalizada do gate. O decorator no código é `@Post` — PascalCase.
  // Sem esta conversão o regex virava `@POST\(…\)`, que não casa nada, e a
  // função devolvia `false` para TODA rota — inclusive as três que estão
  // trancadas de verdade. MEDIDO 2026-10-19: gate inteiro verde com a função
  // que deveria acusá-lo.
  // O mapa é EXPLÍCITO de propósito. `toLowerCase()` em `POST` daria `pOST`,
  // que não é o decorator; e `charAt(0) + slice(1).toLowerCase()` idem. A
  // forma do decorator em Nest é sempre `PascalCase` — `@Get`, `@Post`,
  // `@Put`, `@Patch`, `@Delete` — e o gate não vai deduzir isso.
  const DECORADORES: Record<string, string> = {
    GET: 'Get',
    POST: 'Post',
    PUT: 'Put',
    PATCH: 'Patch',
    DELETE: 'Delete',
  };
  const metodo = rota.slice(0, rota.indexOf(' '));
  const decorator = DECORADORES[metodo] ?? metodo;
  const re = new RegExp(`^[ \\t]*@${decorator}\\(\\s*'([^']*)'\\s*\\)`, 'gm');

  // Cada ocorrência de decorator, com o trecho que a precede.
  const ocorrencias: { rota: string; inicio: number }[] = [];
  for (const m of texto.matchAll(re)) {
    if (m[1] !== undefined) {
      // A barra inicial tem que ser a mesma de `rota` (`POST /tenants/…`) —
      // MEDIDO 2026-10-19: sem ela, `atual.rota` era `POST tenants/…` e a
      // comparação com `rota` nunca casava, e a função devolvia `false` para
      // TODA rota. Um gate que devolve `false` sempre é verde no sentido 2.
      ocorrencias.push({
        rota: `${metodo.toUpperCase()} /${m[1]}`.replace(/\/$/, '/'),
        inicio: m.index,
      });
    }
  }
  if (ocorrencias.length === 0) return false;

  for (let i = 0; i < ocorrencias.length; i++) {
    const atual = ocorrencias[i];
    if (atual === undefined || atual.rota !== rota) continue;

    // ⚠️ O `@RequireFeatureFlag` vem **DEPOIS** do `@Post`, não antes — MEDIDO
    // 2026-10-19 no arquivo real:
    //
    //     81:  @Post('tenants/:id/invitations')
    //     92:  @RequireFeatureFlag('tenancy.invites')
    //
    // A premissa inicial (decorator acima da rota) foi escrita sem abrir o
    // arquivo, e a janela resultante olhava para o lado errado do `@Post`:
    // pegava o `@RequireFeatureFlag` da rota ANTERIOR, e TODA rota parecia
    // trancada — inclusive uma quarta porta recém-aberta, que passava verde.
    //
    // A janela é o trecho ENTRE este `@Post` e o próximo decorator de rota. O
    // Nest resolve os dois decorators para o mesmo handler, então estar entre
    // eles é o que prova que o `@RequireFeatureFlag` pertence a ESTE `@Post`.
    const seguinte = i + 1 < ocorrencias.length ? ocorrencias[i + 1]?.inicio : texto.length;
    const janela = texto.slice(atual.inicio, seguinte);
    return janela.includes(`'${chave}'`);
  }
  return false;
}

/** As chaves que um controller REALMENTE usa (não só menciona em comentário). */
export function chavesUsadasNoController(texto: string): Set<string> {
  const out = new Set<string>();
  for (const m of texto.matchAll(RE_USO_DECORATOR)) {
    if (m[1] !== undefined) out.add(m[1]);
  }
  for (const m of texto.matchAll(RE_USO_INLINE)) {
    if (m[1] !== undefined) out.add(m[1]);
  }
  return out;
}

/** As rotas declaradas no controller: `@Post('x')` e `@Post()` (raiz). */
export function rotasDoController(texto: string): Set<string> {
  const out = new Set<string>();
  // ⚠️ A barra inicial é NORMALIZAÇÃO, não cosmetics. MEDIDO 2026-10-19: sem
  // ela o gate produzia `POST tenants/:id/invitations` e o contrato escreve
  // `POST /tenants/:id/invitations` — as duas coisas não casam, a comparação
  // acusaria a rota INEXISTENTE e o gate viraria alarme falso em todas as três.
  for (const m of texto.matchAll(RE_DECORATOR_ROTA)) {
    if (m[1] !== undefined && m[2] !== undefined) {
      out.add(`${m[1].toUpperCase()} /${m[2]}`.replace(/\/$/, '/'));
    }
  }
  // `@Post()` sem path casa a rota RAIZ — o path real vem do `@Controller()`.
  //
  // O `s` (dotAll) não é estilo: o `@Controller` de um controller grande pode
  // quebrar a linha depois do parêntese de abertura, e um regex de linha única
  // perderia o prefixo e produziria `POST /` — que nenhuma porta declarada usa.
  const ctrl = /@Controller\(\s*'([^']*)'\s*\)/s.exec(texto);
  const prefixo = ctrl?.[1] ?? '';
  for (const m of texto.matchAll(RE_DECORATOR_ROTA_VAZIA)) {
    if (m[1] !== undefined) out.add(`${m[1].toUpperCase()} /${prefixo}`.replace(/\/$/, '/'));
  }
  return out;
}

export function checkFeatureFlagPortas(
  opts: {
    contrato?: string;
    raiz?: string;
    /** Atalho de teste: injeta o texto do contrato e os controllers. */
    contratoTexto?: string;
    controllers?: Map<string, string>;
  } = {},
): ResultadoFeatureFlagPortas {
  const raiz = resolve(__dirname, '..', '..', '..');
  const caminhoContrato = resolve(raiz, opts.contrato ?? CONTRATO);

  const erros: string[] = [];
  const advisories: string[] = [];

  // ⚠️ Arquivo ausente é ERRO nomeado, não `skipped` — o mesmo motivo do
  // `check-feature-flag-contract`: um gate que engole a própria ausência volta
  // verde sem ter medido nada.
  let contrato: string;
  if (opts.contratoTexto !== undefined) {
    contrato = opts.contratoTexto;
  } else if (existsSync(caminhoContrato)) {
    contrato = readFileSync(caminhoContrato, 'utf8');
  } else {
    return {
      ok: false,
      errors: [`contrato ausente (${CONTRATO}) — a lista de portas é a fonte do gate`],
      advisories: [],
    };
  }

  const declaradas = parsearPortas(contrato);

  // Anti-vacuuidade: 0 portas é verde vago. Uma chave com lista vazia é uma
  // chave que não tranca nada, e o gate precisa dizer isso em vez de passar.
  if (declaradas.length === 0) {
    return {
      ok: false,
      errors: [
        `nenhuma porta declarada em ${CONTRATO} §8.1 — ` +
          `o gate não tem o que verificar (0 portas ≠ 0 rotas measured)`,
      ],
      advisories: [],
    };
  }

  // Os controllers: o atalho de teste injeta, senão lê do disco.
  const controllers = opts.controllers ?? new Map<string, string>();
  if (opts.controllers === undefined) {
    for (const caminho of controllersEm(raiz)) {
      controllers.set(nomeDe(caminho), readFileSync(caminho, 'utf8'));
    }
  }

  let conferidas = 0;

  // ── Sentido 1: a rota listada existe e o controller a tranca de verdade ──
  for (const porta of declaradas) {
    const texto = controllers.get(nomeDe(porta.controller));
    if (texto === undefined) {
      erros.push(
        `porta "${porta.rota}" (${porta.chave}) declara controller ` +
          `"${porta.controller}", que não existe sob ${RAIZ_CONTROLLERS}`,
      );
      continue;
    }
    conferidas++;

    // (a) a rota existe como decorator
    const doMetodo = [...rotasDoController(texto)].filter((r) =>
      r.startsWith(porta.rota.slice(0, porta.rota.indexOf(' '))),
    );
    if (doMetodo.length === 0) {
      erros.push(
        `porta "${porta.rota}" (${porta.chave}) não existe como decorator em ` +
          `${porta.controller} — rotas lá: ` +
          `${[...rotasDoController(texto)].join(', ') || 'nenhuma'}`,
      );
      continue;
    }

    // (b) o controller USA a chave — mas **nesta rota**.
    //
    // ⚠️ Este é o furo que a primeira versão tinha, e é o mais grave possível
    // num gate de flag: removing o `@RequireFeatureFlag` de uma porta DECLARADA
    // deixava a rota ABERTA com a flag desligada, e o gate ficava VERDE.
    // MEDIDO 2026-10-19: `chavesUsadasNoController(texto)` devolvia a chave
    // porque OUTRA rota do mesmo arquivo a usava — duas portas no mesmo
    // controller, uma perde o decorator, e a contagem por arquivo não via nada.
    //
    // A pergunta correta é "ESTA rota tranca a chave", e a resposta é por
    // decorator. O mecanismo `inline` é conferido à parte, porque a
    // `chaveDesligada` fica no CORPO do handler, não num decorator.
    const usadas = chavesUsadasNoController(texto);
    if (!usadas.has(porta.chave)) {
      erros.push(
        `porta "${porta.rota}" (${porta.chave}) declara mecanismo "${porta.mecanismo}", ` +
          `mas ${porta.controller} não USA a chave — só @RequireFeatureFlag('${porta.chave}') ` +
          `ou chaveDesligada(…, '${porta.chave}') contam, e menção em comentário não`,
      );
      continue;
    }
    if (porta.mecanismo === 'decorator' && !rotaTrancaComAChave(texto, porta.rota, porta.chave)) {
      erros.push(
        `porta "${porta.rota}" (${porta.chave}) declara mecanismo "decorator", mas ` +
          `NENHUM @RequireFeatureFlag('${porta.chave}') está entre o @Post desta rota e o ` +
          `decorator seguinte — a rota está ABERTA com a flag desligada, e o ` +
          `${porta.controller} usa a chave em OUTRA rota`,
      );
    }
  }

  // ── Sentido 2: o código usa a chave e a lista não sabe ──
  // Este é o que pega a QUARTA porta.
  const declaradasPorChave = new Map<string, Set<string>>();
  for (const p of declaradas) {
    const set = declaradasPorChave.get(p.chave) ?? new Set<string>();
    set.add(p.rota);
    declaradasPorChave.set(p.chave, set);
  }

  // ⚠️ A comparação é por **ROTA**, e não por ARQUIVO — e isso não é detalhe.
  // MEDIDO 2026-10-19: comparando por arquivo, uma quarta porta no
  // `tenancy-invitations.controller.ts` passava VERDE. O arquivo já declara
  // duas portas de `tenancy.invites`, então "este controller tem porta" era
  // verdadeiro e a quarta rota não tinha com quem ser comparada. A porta nova
  // nascia aberta e o gate ficava verde — que é o defeito inteiro da #110
  // happening dentro do gate que fecha a #110.
  for (const [arquivo, texto] of controllers) {
    const rotasDoArquivo = rotasDoController(texto);
    for (const chave of chavesUsadasNoController(texto)) {
      const conhecidas = declaradasPorChave.get(chave);
      if (conhecidas === undefined) {
        erros.push(
          `${arquivo} USA a chave "${chave}" e nenhuma porta dela está declarada em ` +
            `${CONTRATO} §8.1 — ou declare a porta, ou a chave não deveria estar aqui`,
        );
        continue;
      }
      for (const rota of rotasDoArquivo) {
        // A rota casa uma porta DECLARADA **DESTE ARQUIVO**?
        //
        // ⚠️ O predicado precisa do `controller`, e não só do `rota`. MEDIDO
        // 2026-10-19: com `conhecidas.has(rota)` sozinho, mover uma porta
        // trancada para OUTRO arquivo passava verde — o jogo de rotas é
        // pequeno (`POST /tenants/:id/invitations` existe em um controller só),
        // e comparar rota sem comparar arquivo transforma "a porta está em outro
        // lugar" em silêncio. A paridade que a #110 pede é por PORTA, e a porta
        // é o par (rota, arquivo).
        const declaradaAqui = declaradas.some(
          (p: PortaDeclarada) => p.chave === chave && p.rota === rota && p.controller === arquivo,
        );
        if (declaradaAqui) continue;
        // A rota usa a chave? Se o arquivo usa a chave mas esta rota não está
        // na lista, pode ser uma rota que NÃO depende da flag (`GET` de lista,
        // por exemplo) — e acusar aí seria alarme falso.
        if (!rotaTrancaComAChave(texto, rota, chave)) continue;
        erros.push(
          `${arquivo} TRANCA a rota "${rota}" com a chave "${chave}", e ela não está ` +
            `declarada em ${CONTRATO} §8.1 — a porta foi aberta e não declarada`,
        );
      }
    }
  }

  if (declaradas.length > 0) {
    advisories.push(
      `medido: ${declaradas.length} porta(s) declarada(s), ${conferidas} conferida(s) ` +
        `contra o código real.`,
    );
  }
  advisories.push(
    'escopo: este gate confere a PARIDADE declarado ↔ código. NÃO infere consumo ' +
      'indireto de uma funcionalidade — ver o limite declarado no contrato §8.1.',
  );

  return { ok: erros.length === 0, errors: erros, advisories };
}
