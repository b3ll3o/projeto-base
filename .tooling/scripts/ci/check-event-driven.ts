/**
 * SEM shebang, de propósito — ver `check-harness-owner.ts`: um arquivo de
 * `.tooling/scripts/ci/` que não comece com `check-`, não termine em
 * `.spec.ts` e TENHA shebang é classificado como harness órfão.
 *
 * A aplicação é **event-driven** — a regra é
 * [`.agents/specs/conventions/event-driven.md`](../../specs/conventions/event-driven.md).
 * Este gate mede o que a regra diz, no código que roda.
 *
 * ## O furo que este gate fecha
 *
 * MEDIDO em 2026-11-26: a aplicação TEM eventos de domínio (7, em `users` e
 * `profiles`) e NÃO tem como o código expressar a regra. O evento é emitido
 * pelo aggregate, drenado pelo use case e interpretado por um `switch` de
 * `endsWith('.created.v1')` — mas nada no repo diz que:
 *
 * - o nome do evento segue um formato (hoje `users.user.created.v1` convivia
 *   com `profile.created.v1`, e o `mapEventNameToOperation` depende do
 *   SUFIXO — um evento novo com outro nome quebra o `throw`);
 * - o evento não carrega segredo (a senha tem hash; o evento pode virar
 *   log, fila ou payload de terceiro);
 * - o evento é emitido do domínio e não da camada HTTP;
 * - o evento tem CONSUMIDOR (hoje os 3 de `profiles` são **mortos**: o
 *   aggregate emite, ninguém drena);
 * - o efeito colateral não é escrito direto da camada de application (hoje
 *   `auditService.record` é chamado do use case no caminho de tenancy).
 *
 * Sem instrumento, cada uma dessas regras é uma frase na convenção — e a
 * frase não muda o código. Este gate é a frase virando veredito.
 *
 * ## O que este gate NÃO promete
 *
 * - Ele **não** prova que um evento é consumido de verdade: prova que existe
 *   uma **referência à CLASSE do evento** na camada `application` de algum
 *   módulo, fora de um `import`. Um handler que existe e não faz nada passa;
 *   um `import` sem uso não passa.
 * - Ele **não** mede o **nome** do handler — "handler nomeado pelo evento" é a
 *   Fase 1 do plano, e o gate não exige o que ainda não existe.
 * - Ele **não** mede atomicidade (a mutação e o registro de auditoria na MESMA
 *   transação) — isso é o spec de integração
 *   `invariantes-da-conta-no-banco.integration.spec.ts`, e a regra ED8 da
 *   convenção aponta para ele.
 * - Ele **não** mede o conteudo do evento (a forma do payload). A regra ED1
 *   da convenção (o evento carrega o dado que o consumidor precisa, e não só
 *   o nome) é trabalho de projeto, não de regex.
 * - Ele **não** mede **toda** escrita de efeito colateral: mede as escritas
 *   **nomeadas** (`auditService.record` e `auditService.archive` — as portas de
 *   escrita de efeito do repo hoje). Uma escrita nova com outro nome passa;
 *   a lista é curta de propósito, porque um gate que varre "qualquer método
 *   mutante" vira alarme falso.
 * - Ele **não** mede o **agregado** com hífen: o prefixo esperado sai do
 *   PRIMEIRO token do nome do arquivo (`user-profile-created.event.ts` →
 *   `user`), e o agregado do domínio (`UserProfile`) não é consultado. É
 *   decisão de desenho do nome, e o gate não a mede.
 * - Ele **não** resolve o **barrel** por conteúdo: um import do diretório
 *   `events/` conta como o import do evento, mesmo que o barrel não o
 *   reexporte (o nome vinculado é o do evento).
 * - Ele **não** lê os `*.spec.ts` e os `*.test.ts`: um spec que constrói um
 *   evento não é emissão, e um spec de handler não é consumidor. Medir os
 *   specs faria o gate passar por specs e falhar por produção. ⚠️ O furo
 *   conhecido: código de produção dentro de um arquivo `*.spec.ts` escapa
 *   das regras — e isso vale para QUALQUER gate de texto do repo.
 *
 * ## As duas direções
 *
 * Violação **não declarada** no registro
 * (`.tooling/scripts/ci/excecoes-event-driven.json`) é erro. Violação
 * **declarada** é dívida aceita e medida. E exceção que parou de valer
 * (o defeito foi corrigido e a entrada ficou) é TAMBÉM erro — é o que fecha a
 * classe 7 de `guard-classes.md`: um registro que só cresce é um registro que
 * envelhece em silêncio.
 *
 * A reconciliação tem TRÊS direções: a violação nova (não declarada) é erro;
 * a exceção que parou de valer é erro; e a **CONTAGEM** que a exceção declara
 * (`ocorrencias`) tem que ser a contagem medida — porque um número que só
 * existe no registro não mede nada, e a dívida cresce no código enquanto o
 * registro continua dizendo 1.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { linhasDoRelato, type CheckResult } from './check-types';

/** A raiz do código da API — onde vivem os módulos. */
const RAIZ_DA_API = 'apps/api/src';

/** Onde os eventos de domínio moram, relativo ao módulo. */
const CAMINHO_CANONICO_DO_EVENTO = '/domain/events/';

/** Onde um CONSUMIDOR de evento mora: a camada `application` de um módulo. */
const CAMINHO_DA_CAMADA_DE_APLICACAO = '/application/';

/** Onde um evento pode ser EMITIDO: o domínio do próprio módulo. */
const CAMINHO_DO_DOMINIO = '/domain/';

/** O registro das exceções (dívida aceita e medida). */
export const ARQUIVO_DE_EXCECOES = '.tooling/scripts/ci/excecoes-event-driven.json';

/**
 * O formato do nome do evento: `<bc>.<agregado>.<acao>.vN`.
 *
 * O prefixo `<bc>.<agregado>.` é DERIVADO do caminho e do nome do arquivo
 * (veja `prefixoEsperadoDoEvento`) — o gate não confia no que o código declara
 * para decidir o que o código deveria declarar. E o `vN` é o que permite
 * evoluir o contrato do evento sem quebrar quem consome.
 */
const RE_NOME_DO_EVENTO = /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*\.[a-z][a-z0-9-]*\.v\d+$/;

/** Os campos que todo evento de domínio precisa ter. */
const CAMPOS_OBRIGATORIOS = ['occurredAt', 'aggregateId', 'version'] as const;

/**
 * As palavras que não podem estar no payload de um evento.
 *
 * Um evento é o que sai do agregado — e o agregado tem a senha (o hash).
 * Evento vira log, fila, payload de terceiro e arquivo de auditoria: o que
 * entra nele sai do processo. Por isso o gate olha o NOME do campo declarado,
 * e não o valor — o valor mudaria a cada execução.
 *
 * ⚠️ O padrão NÃO usa `\b` na borda: `accessTokenExpiresAt` é um token.
 */
const RE_SEGREDO = /senha|password|token|secret|segredo|credential|credencial|jwt/i;

/**
 * As escritas de efeito colateral que a camada `application` não pode fazer
 * direto. O caminho do EVENT-DRIVEN é o handler; o use case publica.
 *
 * A lista é CURTA e nomeada: cada entrada é uma porta real do repo. Um gate
 * que varre "qualquer método mutante" vira alarme falso no primeiro
 * `listHistory` — e um gate que se acostuma a alarmar é desligado.
 */
const ESCRITAS_DE_EFEITO_COLATERAL: readonly { rotulo: string; padrao: RegExp }[] = [
  { rotulo: 'auditService.record', padrao: /\bauditService\.record\s*\(/ },
  { rotulo: 'auditService.archive', padrao: /\bauditService\.archive\s*\(/ },
];

/**
 * O arquivo imports o EVENTO — por import RESOLVIDO (o caminho relativo
 * aponta para o arquivo do evento) ou pelo BARREL do diretório de eventos do
 * mesmo módulo.
 *
 * MEDIDO em 2026-11-27: o gate comparava o alvo do import com o NOME do
 * arquivo do evento (`endsWith`) — o que casava o evento de OUTRO módulo com
 * o mesmo nome de arquivo (falso positivo) e NÃO casava o import por barrel
 * (`from '../domain/events/index.js'` — falso negativo de ED3 e falso
 * positivo de ED5).
 */
export function importaClasseDoEvento(
  codigo: string,
  caminhoDoImportador: string,
  evento: EventoDeclarado,
): boolean {
  const dirDoEvento = evento.caminho.split('/').slice(0, -1).join('/');
  for (const imp of importsComNomes(codigo)) {
    if (!imp.nomes.includes(evento.classe)) continue;
    const resolvido = resolverCaminho(caminhoDoImportador, imp.alvo);
    if (resolvido === null) continue;
    const normalizado = normalizarCaminho(resolvido);
    if (normalizado === evento.caminho) return true;
    if (normalizado === `${dirDoEvento}/index.ts`) return true;
  }
  return false;
}

/** Um evento de domínio declarado no código. */
export interface EventoDeclarado {
  /** Caminho repo-relative do arquivo. */
  caminho: string;
  /** O bounded context (`users`, `profiles`). */
  modulo: string;
  /** A classe do evento (`UserCreatedEvent`). */
  classe: string;
  /** O `eventName` declarado. */
  eventName: string;
  /** O prefixo que o nome DEVERIA ter, derivado do caminho. */
  prefixoEsperado: string;
}

/** Uma exceção declarada no registro. */
export interface ExcecaoDeclarada {
  regra: 'ED5' | 'ED6';
  /** A chave da ocorrência: o `eventName` (ED5) ou `arquivo|rotulo` (ED6). */
  chave: string;
  /** O motivo, em prosa — por que a dívida existe. */
  motivo: string;
  /** Quantas ocorrências a entrada cobre. O gate reconcilia com o medido. */
  ocorrencias: number;
  verificacao: {
    tipo: 'evento-sem-handler' | 'efeito-colateral-direto';
    classe?: string;
    arquivo?: string;
    padrao?: string;
  };
}

/**
 * O arquivo lido em duas variantes: com o conteúdo das STRINGS apagado e
 * com o conteúdo das strings intacto.
 *
 * ⚠️ Por que um scanner e não um regex. MEDIDO em 2026-11-26: a primeira
 * versão removia comentário com regex, e o regex de linha (`//.*$`) cortava a
 * LINHA INTEIRA quando a linha tinha `//` DENTRO de uma string
 * (`const s = 'a // b'`) — o resto da linha sumia, e um `new UserCreatedEvent(`
 * que viesse depois deixava de ser visto (falso negativo de ED3). E o regex de
 * bloco (`/*…*/ `) ENGOLE o arquivo quando a string contém `; /*` (falso
 * negativo do mesmo tipo).
 *
 * O scanner anda caractere a caractere e sabe onde está: em código, em
 * comentário de linha, em comentário de bloco, ou dentro de uma string
 * ('simples', "dupla" ou `template`). Comentário vira espaço (o
 * comprimento da linha é preservado, para o erro apontar a linha certa) e o
 * conteúdo da string também — é o que impede um `import` escrito DENTRO de
 * uma string de virar "import" para o gate.
 */
export interface Analise {
  /** O código com os comentários apagados (strings intactas). */
  codigo: string;
  /** O código com os comentários E o conteúdo das strings apagados. */
  semStrings: string;
}

export function analisar(texto: string): Analise {
  const codigo: string[] = [];
  const semStrings: string[] = [];
  let estado: 'codigo' | 'linha' | 'bloco' | 'simples' | 'dupla' | 'template' | 'regex' = 'codigo';
  let i = 0;
  const n = texto.length;
  // O último caractere SIGNIFICATIVO do código: é o que decide se um `/` abre
  // uma REGEX ou é uma divisão.
  let ultimo = '';
  // A última PALAVRA do código: `return /x/` é regex, `a / b` é divisão.
  let ultimaPalavra = '';
  // Dentro de uma classe de caracteres `[...]` da regex.
  let emClasse = false;

  while (i < n) {
    const c = texto[i] ?? '';
    const d = texto[i + 1] ?? '';

    if (estado === 'codigo') {
      if (c === '/' && d === '/') {
        estado = 'linha';
        codigo.push(' ', ' ');
        semStrings.push(' ', ' ');
        i += 2;
        continue;
      }
      if (c === '/' && d === '*') {
        estado = 'bloco';
        codigo.push(' ', ' ');
        semStrings.push(' ', ' ');
        i += 2;
        continue;
      }
      if (c === "'") {
        estado = 'simples';
        codigo.push(c);
        semStrings.push(c);
        i += 1;
        continue;
      }
      if (c === '"') {
        estado = 'dupla';
        codigo.push(c);
        semStrings.push(c);
        i += 1;
        continue;
      }
      if (c === '`') {
        estado = 'template';
        codigo.push(c);
        semStrings.push(c);
        i += 1;
        continue;
      }
      if (c === '/' && abreRegex(ultimo, ultimaPalavra)) {
        // REGEX LITERAL. MEDIDO em 2026-11-27: o scanner tratava o apóstrofo
        // de `/['"]/` como abertura de string, e o arquivo inteiro ficava
        // desmontado a partir dali — o `new <Classe>(` que viesse depois
        // sumia da medição (falso negativo de ED3).
        estado = 'regex';
        codigo.push(c);
        semStrings.push(' ');
        i += 1;
        continue;
      }
      if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') {
        ultimo = c;
        ultimaPalavra = /[A-Za-z0-9_$]/.test(c) ? ultimaPalavra + c : '';
        if (!/[A-Za-z0-9_$]/.test(c)) ultimaPalavra = '';
      }
      codigo.push(c);
      semStrings.push(c);
      i += 1;
      continue;
    }

    if (estado === 'linha') {
      if (c === '\n') {
        estado = 'codigo';
        codigo.push('\n');
        semStrings.push('\n');
      } else {
        codigo.push(' ');
        semStrings.push(' ');
      }
      i += 1;
      continue;
    }

    if (estado === 'bloco') {
      if (c === '*' && d === '/') {
        codigo.push(' ', ' ');
        semStrings.push(' ', ' ');
        i += 2;
        estado = 'codigo';
        continue;
      }
      codigo.push(c === '\n' ? '\n' : ' ');
      semStrings.push(c === '\n' ? '\n' : ' ');
      i += 1;
      continue;
    }

    if (estado === 'regex') {
      // O ESCAPE é do par inteiro; a classe de caracteres `[...]` guarda o
      // `/` que fecha a regex.
      if (c === '\\') {
        codigo.push(c, d);
        semStrings.push(' ', ' ');
        i += 2;
        continue;
      }
      if (c === '[') {
        emClasse = true;
        codigo.push(c);
        semStrings.push(' ');
        i += 1;
        continue;
      }
      if (c === ']') {
        emClasse = false;
        codigo.push(c);
        semStrings.push(' ');
        i += 1;
        continue;
      }
      if (c === '/' && !emClasse) {
        estado = 'codigo';
        codigo.push(c);
        semStrings.push(' ');
        i += 1;
        continue;
      }
      if (c === '\n') {
        // Regex que atravessa linha é regex inválido: o scanner volta para o
        // código em vez de engolir o arquivo.
        estado = 'codigo';
        emClasse = false;
        codigo.push(c);
        semStrings.push('\n');
        i += 1;
        continue;
      }
      codigo.push(c);
      semStrings.push(' ');
      i += 1;
      continue;
    }

    // Dentro de string: o ESCAPE é do par inteiro.
    if (c === '\\') {
      codigo.push(c, d);
      semStrings.push(' ', ' ');
      i += 2;
      continue;
    }
    if (
      (estado === 'simples' && c === "'") ||
      (estado === 'dupla' && c === '"') ||
      (estado === 'template' && c === '`')
    ) {
      estado = 'codigo';
      codigo.push(c);
      semStrings.push(c);
      i += 1;
      continue;
    }
    codigo.push(c);
    semStrings.push(c === '\n' ? '\n' : ' ');
    i += 1;
  }

  return { codigo: codigo.join(''), semStrings: semStrings.join('') };
}

/**
 * Um `/` abre uma REGEX literal ou é uma DIVISÃO.
 *
 * A distinção importa porque uma regex pode conter aspas (`/['"]/`) — e uma
 * aspatreatmenta que abre string desmonta o arquivo inteiro (MEDIDO em
 * 2026-11-27: `apps/api/src/shared/infrastructure/prisma/traducao-de-falha-de-conexao.ts:90`
 * tem `/at `([^`]+)`/` e o `semStrings` saía com o arquivo desmontado dali).
 *
 * A heurística é a do lexer do TypeScript: depois de `(` `,` `=` `:` `return`
 * e companhia vem uma regex; depois de um identificador vem uma divisão.
 */
export function abreRegex(ultimo: string, ultimaPalavra: string): boolean {
  if (ultimo === '') return true;
  if ('(,=:[!&|?{};+-*%^~'.includes(ultimo)) return true;
  const PALAVRAS_DE_REGEX = [
    'return',
    'typeof',
    'case',
    'in',
    'of',
    'new',
    'delete',
    'void',
    'instanceof',
    'do',
    'else',
    'yield',
    'await',
  ];
  return PALAVRAS_DE_REGEX.includes(ultimaPalavra);
}

/**
 * O corpo do arquivo SEM os comentários.
 *
 * ⚠️ MEDIDO: sem isso, o gate acusa a própria documentação do arquivo — os
 * `domain/ports/*.port.ts` mentionam `infrastructure/persistence/` em
 * COMENTÁRIO, e a regra ED4 acusaria dependência invertida onde não há
 * dependência. É a mesma lição do `check-tenant-scope-source`.
 */
export function semComentarios(texto: string): string {
  return analisar(texto).codigo;
}

/**
 * O corpo do arquivo sem comentários e sem o CONTEÚDO das strings.
 *
 * É o que o gate usa para procurar `new <Classe>(` e para a referência ao
 * evento: um nome de classe que aparece DENTRO de uma string não é uso.
 */
export function semStrings(texto: string): string {
  return analisar(texto).semStrings;
}

/**
 * O código sem as linhas que são DECLARAÇÃO de import.
 *
 * ⚠️ MEDIDO em 2026-11-26: a primeira versão removia `^[ \t]*(?:import|export)\b[^;]*;`
 * — e `export class UserUseCases { … await this.auditService.record({}); … }`
 * casava como uma linha de import: o `[^;]*` ia até o PRIMEIRO `;`, que era o
 * do `record({})`. O gate perdia a escrita de efeito colateral que estava
 * procurando, e perdia o uso da classe do evento no mesmo passo. A regex
 * agora só aceita `import …` e `export { … } from …`.
 */
export function semImports(codigo: string): string {
  // ⚠️ MEDIDO em 2026-11-27: o `[^;]*` ANTES atravessava linhas — um import
  // sem ponto-e-vírgula apagava o código até o próximo `;` do arquivo, e a
  // escrita de efeito colateral que viesse depois sumia da medição. O corte
  // é por LINHA, e um import de várias linhas é consumido até o `;`.
  const saida: string[] = [];
  let dentroDeImport = false;
  for (const linha of codigo.split('\n')) {
    if (dentroDeImport) {
      if (linha.includes(';')) dentroDeImport = false;
      saida.push('');
      continue;
    }
    const eImport =
      /^[ \t]*import\b/.test(linha) ||
      (/^[ \t]*export\s+(\*|\{)/.test(linha) && /\bfrom\b/.test(linha));
    if (eImport) {
      // O import de VÁRIAS linhas é o único que se consome além da própria
      // linha — e só quando ele está INCOMPLETO (sem `from`). Um import sem
      // ponto-e-vírgula, mas COM `from`, é uma linha só: cortar até o `;`
      // seguinte apagava o código que vem depois (MEDIDO em 2026-11-27).
      if (!/\bfrom\b/.test(linha) && !linha.includes(';')) dentroDeImport = true;
      saida.push('');
      continue;
    }
    saida.push(linha);
  }
  return saida.join('\n');
}

/**
 * Um import declarado: o ALVO (o caminho) e os NOMES que ele vincula.
 *
 * Os nomes importam porque o gate precisa saber QUAL símbolo entrou por
 * aquele import — e não só DE ONDE (MEDIDO em 2026-11-27: `import { X } from
 * '../infrastructure/x.js'` (aspas duplas), `export * from '...'` e
 * `await import('...')` escapavam do gate, e um import por BARREL
 * (`from '../domain/events/index.js'`) não era reconhecido).
 */
export interface ImportDeclarado {
  /** O caminho do módulo importado. */
  alvo: string;
  /** Os nomes que o import vincula (o default, os nomeados, o `as`). */
  nomes: string[];
}

/** Os nomes que uma cláusula de import vincula. */
export function nomesDoImport(clausula: string): string[] {
  const limpa = clausula.trim();
  if (limpa === '' || limpa === '*') return [];
  if (!limpa.startsWith('{')) {
    // `import X from` — o default. `import * as X from` — o namespace, que
    // NÃO vincula a classe do evento pelo nome.
    const partes = limpa.split(/\s+as\s+/);
    const ultimo = partes[partes.length - 1] ?? '';
    return ultimo.startsWith('*') ? [] : [ultimo];
  }
  const dentro = limpa.slice(1, limpa.lastIndexOf('}'));
  const out: string[] = [];
  for (const bruto of dentro.split(',')) {
    const parte = bruto.trim();
    if (parte === '') continue;
    const como = parte.split(/\s+as\s+/);
    const nome = (como[1] ?? como[0] ?? '').trim().replace(/^\*\s+as\s+/, '');
    if (nome !== '') out.push(nome);
  }
  return out;
}

/**
 * Os imports declarados — em LINHA INTEIRA.
 *
 * ⚠️ O `^` com a flag `m` é o que impede um `import` escrito dentro de uma
 * string (ou de uma linha de texto) de virar import.
 */
export function importsComNomes(codigo: string): ImportDeclarado[] {
  const out: ImportDeclarado[] = [];
  for (const m of codigo.matchAll(
    /^[ \t]*(?:import\s+(?:type\s+)?([^\n]*?)\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|export\s+(\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"])/gm,
  )) {
    const alvo = m[2] ?? m[3] ?? m[5] ?? '';
    const clausula = m[1] ?? m[4] ?? '';
    out.push({ alvo, nomes: nomesDoImport(clausula) });
  }
  // O import DINÂMICO (`await import('...')`) não é ancorado na linha — vem
  // depois de `await` — e é import do mesmo jeito.
  for (const m of codigo.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push({ alvo: m[1] ?? '', nomes: [] });
  }
  return out;
}

/**
 * Os caminhos importados — declarados em LINHA INTEIRA.
 *
 * ⚠️ O `^` com a flag `m` é o que impede um `import` escrito dentro de uma
 * string (ou de uma linha de texto) de virar import. E o `[^;]*` impede que
 * a linha case a próxima importação.
 */
export function importsDe(codigo: string): string[] {
  return importsComNomes(codigo).map((i) => i.alvo);
}

/**
 * O caminho de um import RELATIVO, resolvido contra o arquivo que o declara.
 *
 * Sem resolver, o gate comparava o ALVO do import com o nome do arquivo do
 * evento — e `endsWith` casava o evento do OUTRO módulo com o mesmo nome de
 * arquivo (falso positivo de ED3/ED5) e NÃO casava o import por BARREL
 * (falso negativo de ED3 e falso positivo de ED5).
 *
 * A extensão `.js` do import (NodeNext) é normalizada para `.ts` — é o
 * mesmo arquivo.
 */
export function resolverCaminho(caminhoDoImportador: string, alvo: string): string | null {
  if (!alvo.startsWith('.')) return null;
  const dir = caminhoDoImportador.split('/').slice(0, -1).join('/');
  const partes = dir === '' ? [] : dir.split('/');
  for (const parte of alvo.split('/')) {
    if (parte === '.' || parte === '') continue;
    if (parte === '..') partes.pop();
    else partes.push(parte);
  }
  return partes.join('/');
}

/** O caminho normalizado: `.js` do import é o `.ts` do arquivo. */
export function normalizarCaminho(caminho: string): string {
  return caminho.endsWith('.js') ? `${caminho.slice(0, -3)}.ts` : caminho;
}

/**
 * O corpo da classe — entre as chaves.
 *
 * MEDIDO: a checagem de campo e a de segredo varrem o ARQUIVO INTEIRO, e uma
 * segunda classe no mesmo arquivo (ou um helper com `readonly token`) fazia o
 * evento passar (falso negativo de ED1) ou ser acusado (falso positivo de
 * ED7). A contagem de chaves usa a variante sem strings, para uma chave
 * dentro de uma string não desbalancear o par.
 */
export function corpoDaClasse(semStrings: string, classe: string): string | null {
  const re = new RegExp(`\\bclass\\s+${classe}\\b`);
  const achado = re.exec(semStrings);
  if (achado === null) return null;
  const abre = semStrings.indexOf('{', achado.index);
  if (abre < 0) return null;
  let nivel = 0;
  for (let j = abre; j < semStrings.length; j++) {
    const c = semStrings[j];
    if (c === '{') nivel += 1;
    else if (c === '}') {
      nivel -= 1;
      if (nivel === 0) return semStrings.slice(abre + 1, j);
    }
  }
  return null;
}

/**
 * O prefixo que o `eventName` DEVERIA ter, derivado do caminho.
 *
 * `apps/api/src/modules/users/domain/events/user-created.event.ts` →
 * `users.user.created.`. A agregação vem do NOME DO ARQUIVO: o aggregate é o
 * primeiro segmento (`user`) e a ação é o resto (`created`).
 *
 * Derivar do caminho — e não do que o código declara — é o que impede o gate
 * de validar o nome contra ele mesmo: um arquivo com o nome errado que se
 * auto-declara errado passaria.
 */
export function prefixoEsperadoDoEvento(caminho: string): string | null {
  const modulo = moduloDoCaminho(caminho);
  if (modulo === null) return null;
  const arquivo = caminho.split('/').pop() ?? '';
  const base = arquivo.replace(/\.event\.ts$/, '');
  if (base === arquivo) return null;
  const segmentos = base.split('-');
  const aggregate = segmentos[0];
  const acao = segmentos.slice(1).join('-');
  if (aggregate === undefined || aggregate === '' || acao === '') return null;
  return `${modulo}.${aggregate}.${acao}.`;
}

/**
 * O bounded context de um caminho — o segmento depois de `modules/`.
 *
 * `apps/api/src/modules/users/domain/events/user-created.event.ts` → `users`.
 * O caminho que não é de módulo devolve `null` (o `shared/` não é módulo).
 */
export function moduloDoCaminho(caminho: string): string | null {
  const partes = caminho.split('/');
  const i = partes.indexOf('modules');
  if (i < 0 || i + 1 >= partes.length) return null;
  return partes[i + 1] ?? null;
}

/**
 * As PROPRIEDADES declaradas pela classe — os campos de classe e as
 * parameter properties do construtor.
 *
 * ⚠️ MEDIDO em 2026-11-27: a regra ED1/ED7 media `readonly <campo>:` — e
 * isso (1) deixava passar o segredo em campo MUTÁVEL (`passwordHash!: string`)
 * e em parameter property (`constructor(public senhaHash: string)`), e (2)
 * acusava como ausente um campo declarado sem anotação de tipo
 * (`readonly occurredAt = new Date()`). A convenção promete "o campo
 * DECLARADO" — o gate tinha de medir o campo declarado.
 */
export function propriedadesDeclaradas(corpo: string): string[] {
  const out: string[] = [];
  // Os parâmetros do construtor: um parameter property (`readonly x: T`) é
  // um CAMPO da classe; um parâmetro comum (`x: T`) NÃO é.
  const construtor = /\bconstructor\s*\(/.exec(corpo);
  if (construtor !== null) {
    const abre = corpo.indexOf('(', construtor.index);
    let nivel = 0;
    let fecha = -1;
    for (let j = abre; j < corpo.length; j++) {
      const c = corpo[j];
      if (c === '(') nivel += 1;
      else if (c === ')') {
        nivel -= 1;
        if (nivel === 0) {
          fecha = j;
          break;
        }
      }
    }
    if (fecha > 0) {
      const parametros = corpo.slice(abre, fecha);
      for (const m of parametros.matchAll(
        /\b(?:public|private|protected|readonly|override)\s+([A-Za-z0-9_$]+)\s*[!?]?\s*:/g,
      )) {
        if (m[1] !== undefined) out.push(m[1]);
      }
    }
  }
  // Os campos de classe: o que está FORA do construtor.
  const foraDoConstrutor = construtor !== null ? corpo.slice(0, construtor.index) : corpo;
  for (const m of foraDoConstrutor.matchAll(
    /(?:^|[;{}])\s*(?:(?:public|private|protected|readonly|static|declare|override)\s+)*([A-Za-z0-9_$]+)\s*[!?]?\s*(?::[^;={}]*)?(?:=|;)/gm,
  )) {
    const nome = m[1];
    if (nome === undefined) continue;
    if (nome === 'constructor' || nome === 'implements' || nome === 'extends') continue;
    out.push(nome);
  }
  return [...new Set(out)];
}

/**
 * O CABEÇALHO da classe — do `class X` até a chave de abertura.
 *
 * A cláusula `implements` vive no cabeçalho, não no corpo: medir o arquivo
 * inteiro deixava uma STRING (`const d = 'implements DomainEvent'`) e uma
 * segunda classe do mesmo arquivo satisfazerem a regra do evento.
 */
export function cabecalhoDaClasse(semStrings: string, classe: string): string | null {
  const achado = new RegExp(`\\bclass\\s+${classe}\\b`).exec(semStrings);
  if (achado === null) return null;
  const abre = semStrings.indexOf('{', achado.index);
  if (abre < 0) return null;
  return semStrings.slice(achado.index, abre);
}

/**
 * O nome da classe que o ARQUIVO declara — a que bate com o nome do arquivo.
 *
 * ⚠️ MEDIDO em 2026-11-27: o gate pegava a PRIMEIRA classe exportada do
 * arquivo — e um arquivo com duas classes (uma auxiliar e a do evento) media
 * a auxiliar: a auxiliar implementava `DomainEvent` e a classe do evento não,
 * e o gate passava. A classe do evento é a que o NOME DO ARQUIVO diz.
 */
export function nomeDaClasseEsperada(caminho: string): string | null {
  const arquivo = caminho.split('/').pop() ?? '';
  const base = arquivo.replace(/\.event\.ts$/, '');
  if (base === arquivo || base === '') return null;
  const camel = base
    .split('-')
    .filter((parte) => parte !== '')
    .map((parte) => parte[0]?.toUpperCase() + parte.slice(1))
    .join('');
  return camel === '' ? null : `${camel}Event`;
}

/** A classe declarada no arquivo do evento. */
export function classeDoEvento(codigo: string, nomeEsperado?: string): string | null {
  const classes = [
    ...codigo.matchAll(/export\s+(?:default\s+|abstract\s+)?class\s+([A-Za-z0-9_]+)/g),
  ].map((m) => m[1] ?? '');
  if (nomeEsperado !== undefined && classes.includes(nomeEsperado)) return nomeEsperado;
  return classes[0] ?? null;
}

/** O `eventName` declarado — literal, com aspas simples ou duplas. */
export function eventNameDeclarado(codigo: string): string | null {
  const m = /readonly\s+eventName\s*(?::\s*string)?\s*=\s*(['"])([^'"]+)\1/.exec(codigo);
  return m?.[2] ?? null;
}

/**
 * Os arquivos que DEVERIAM ser eventos.
 *
 * ⚠️ MEDIDO em 2026-11-27: o gate só recolhia `*.event.ts` **sob** `/domain/`
 * — e um arquivo de evento FORA desse conjunto (em `application/events/`, ou
 * `domain/events/user-created.ts` sem o sufixo `.event.`) não era lido, não
 * era medido e não era reportado: o evento escapava de ED1, ED2 e ED7
 * inteiro, sem deixar rastro. A regra ED1 (o caminho canônico é
 * `<módulo>/domain/events/`) só pode ser cobrada se o arquivo FORA do
 * caminho entrar na medição — é o que este conjunto faz: todo arquivo de um
 * módulo que parece evento (`*.event.ts` ou sob um diretório `events/`).
 */
export function arquivosDeEvento(arvore: Map<string, string>): string[] {
  const out: string[] = [];
  for (const caminho of arvore.keys()) {
    if (moduloDoCaminho(caminho) === null) continue;
    const pareceEvento = caminho.endsWith('.event.ts') || caminho.includes('/events/');
    if (!pareceEvento) continue;
    out.push(caminho);
  }
  return out.sort();
}

/** Os eventos declarados na árvore dada. */
export function coletarEventos(arvore: Map<string, string>): EventoDeclarado[] {
  const out: EventoDeclarado[] = [];
  for (const caminho of arquivosDeEvento(arvore)) {
    const codigo = semComentarios(arvore.get(caminho) ?? '');
    const classe = classeDoEvento(codigo, nomeDaClasseEsperada(caminho) ?? undefined);
    const eventName = eventNameDeclarado(codigo);
    const prefixoEsperado = prefixoEsperadoDoEvento(caminho);
    if (classe === null || eventName === null || prefixoEsperado === null) continue;
    out.push({
      caminho,
      modulo: moduloDoCaminho(caminho) ?? '',
      classe,
      eventName,
      prefixoEsperado,
    });
  }
  return out;
}

/** Lê a árvore de `.ts` de produção da API (sem os specs). */
export function lerArvoreDaApi(raiz: string): Map<string, string> {
  const arvore = new Map<string, string>();
  const base = resolve(raiz, RAIZ_DA_API);
  if (!existsSync(base)) return arvore;
  const anda = (dir: string): void => {
    for (const entrada of readdirSync(dir).sort()) {
      const p = join(dir, entrada);
      if (statSync(p).isDirectory()) anda(p);
      else if (
        entrada.endsWith('.ts') &&
        !entrada.endsWith('.spec.ts') &&
        !entrada.endsWith('.test.ts') &&
        !entrada.endsWith('.d.ts')
      ) {
        arvore.set(relative(raiz, p).split('\\').join('/'), readFileSync(p, 'utf8'));
      }
    }
  };
  anda(base);
  return arvore;
}

/** Lê o registro de exceções, validando o formato. */
export function lerExcecoes(raiz: string): { excecoes: ExcecaoDeclarada[]; erros: string[] } {
  const caminho = resolve(raiz, ARQUIVO_DE_EXCECOES);
  if (!existsSync(caminho)) return { excecoes: [], erros: [] };
  let bruto: { excecoes?: ExcecaoDeclarada[] };
  try {
    bruto = JSON.parse(readFileSync(caminho, 'utf8')) as { excecoes?: ExcecaoDeclarada[] };
  } catch (erro) {
    // ⚠️ MEDIDO em 2026-11-27: o `JSON.parse` sem `try` derrubava o gate com
    // stack trace cru — e no preflight virava "o check LANÇOU", no hook de
    // commit, stack trace na cara de quem commita.
    return {
      excecoes: [],
      erros: [
        `${ARQUIVO_DE_EXCECOES}: JSON inválido — ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      ],
    };
  }
  const excecoes = bruto.excecoes ?? [];
  return { excecoes, erros: validarExcecoes(excecoes) };
}

/**
 * A validação do registro — a mesma para o registro lido do disco e para o
 * registro que a spec entrega em memória.
 */
export function validarExcecoes(excecoes: ExcecaoDeclarada[]): string[] {
  const erros: string[] = [];
  const vistas = new Set<string>();
  for (const excecao of excecoes) {
    const onde = `${ARQUIVO_DE_EXCECOES} / ${excecao.regra}|${excecao.chave}`;
    if (excecao.regra !== 'ED5' && excecao.regra !== 'ED6') {
      erros.push(
        `${onde}: regra "${excecao.regra}" não existe — as regras do registro são ED5 e ED6`,
      );
    }
    // A chave DUPLICADA: o `Map` do gate sobrescrevia a primeira entrada e a
    // segunda passava sem ser vista (MEDIDO em 2026-11-27).
    const chave = `${excecao.regra}|${excecao.chave}`;
    if (vistas.has(chave)) {
      erros.push(`${onde}: entrada duplicada no registro — a segunda esconde a primeira`);
    }
    vistas.add(chave);
    if (typeof excecao.motivo !== 'string' || excecao.motivo.trim().length < 8) {
      erros.push(`${onde}: motivo ausente ou curto demais — a exceção é uma linha escrita`);
    }
    if (typeof excecao.ocorrencias !== 'number' || excecao.ocorrencias < 1) {
      erros.push(
        `${onde}: \`ocorrencias\` ausente ou < 1 — o gate reconcilia a contagem com o medido`,
      );
    }
    if (excecao.verificacao === undefined || typeof excecao.verificacao !== 'object') {
      erros.push(`${onde}: \`verificacao\` ausente — a verificação é a prova do motivo`);
      continue;
    }
    const tipoEsperado = excecao.regra === 'ED5' ? 'evento-sem-handler' : 'efeito-colateral-direto';
    if (excecao.verificacao.tipo !== tipoEsperado) {
      erros.push(
        `${onde}: \`verificacao.tipo\` é "${excecao.verificacao.tipo ?? ''}" e a regra ${excecao.regra} ` +
          `exige "${tipoEsperado}"`,
      );
    }
  }
  return erros;
}

/**
 * O gate.
 *
 * @param opts.arvore — atalho de teste: a árvore (caminho → conteúdo) no lugar
 *   do disco. Sem ele, o gate lê `apps/api/src` do repo.
 * @param opts.excecoes — atalho de teste: o registro no lugar do disco.
 */
export function checkEventDriven(
  opts: { raiz?: string; arvore?: Map<string, string>; excecoes?: ExcecaoDeclarada[] } = {},
): CheckResult {
  const raiz = resolve(opts.raiz ?? resolve(__dirname, '..', '..', '..'));
  const arvore = opts.arvore ?? lerArvoreDaApi(raiz);
  const registro =
    opts.excecoes !== undefined
      ? { excecoes: opts.excecoes, erros: validarExcecoes(opts.excecoes) }
      : lerExcecoes(raiz);

  const errors: string[] = [...registro.erros];
  const advisories: string[] = [];

  // O parser é o custo do gate: ED3 e ED5 reanalisavam cada arquivo por
  // evento (MEDIDO em 2026-11-27: 7 eventos × 144 arquivos = 1008 passes).
  // O cache é por CAMINHO — o mesmo arquivo é o mesmo texto.
  const analises = new Map<string, Analise>();
  const analisarDe = (caminho: string, conteudo: string): Analise => {
    let a = analises.get(caminho);
    if (a === undefined) {
      a = analisar(conteudo);
      analises.set(caminho, a);
    }
    return a;
  };

  const eventos = coletarEventos(arvore);
  const todosOsArquivos = arquivosDeEvento(arvore);

  // Anti-vacuuidade: 0 eventos é verde vago. Um gate que não achou o que
  // verificar tem de dizer isso, não passar.
  if (eventos.length === 0) {
    return {
      ok: false,
      errors: [
        ...errors,
        `nenhum evento de domínio encontrado sob ${RAIZ_DA_API}/modules/*/${CAMINHO_CANONICO_DO_EVENTO} — ` +
          `o gate não tem o que verificar (0 eventos ≠ 0 violações)`,
      ],
      advisories: [],
    };
  }

  // ⚠️ Um arquivo `*.event.ts` que o gate NÃO leu é um evento que ESCAPA de
  // ED1, ED2 e ED7. MEDIDO: a primeira versão simplesmente pulava o arquivo
  // (aspas duplas, `export default class`, nome de arquivo com ponto) — e o
  // evento sumia da medição sem que ninguém soubesse.
  const ilegiveis = todosOsArquivos.filter((c) => !eventos.some((e) => e.caminho === c));
  for (const caminho of ilegiveis) {
    errors.push(
      `${caminho}: arquivo de evento que o gate NÃO leu — ou a classe não é \`export class\`, ` +
        `ou o \`eventName\` não é literal, ou o nome do arquivo não é \`<agregado>-<ação>.event.ts\`. ` +
        `Evento ilegível é evento fora da medição`,
    );
  }

  // ── ED1 — o nome, o contrato e o segredo ─────────────────────────────────
  for (const evento of eventos) {
    const analise = analisar(arvore.get(evento.caminho) ?? '');
    const corpo = corpoDaClasse(analise.semStrings, evento.classe);

    const cabecalho = cabecalhoDaClasse(analise.semStrings, evento.classe);
    if (cabecalho === null || !/\bimplements\s+DomainEvent\b/.test(cabecalho)) {
      errors.push(
        `${evento.caminho}: a classe ${evento.classe} não implementa \`DomainEvent\` — ` +
          `um evento sem o contrato comum não é comparável com o de outro módulo`,
      );
    }
    if (!evento.caminho.includes(CAMINHO_CANONICO_DO_EVENTO)) {
      errors.push(
        `${evento.caminho}: o evento não mora em \`<módulo>${CAMINHO_CANONICO_DO_EVENTO}\` — ` +
          `o caminho canônico é parte do contrato (é dele que sai o prefixo do \`eventName\`)`,
      );
    }
    if (!evento.eventName.startsWith(evento.prefixoEsperado)) {
      errors.push(
        `${evento.caminho}: \`eventName\` é "${evento.eventName}" e o formato é ` +
          `\`${evento.prefixoEsperado}<versão>\` — o prefixo vem do caminho ` +
          `(módulo + agregado + ação), não do que o código declara`,
      );
    } else if (!RE_NOME_DO_EVENTO.test(evento.eventName)) {
      errors.push(
        `${evento.caminho}: \`eventName\` "${evento.eventName}" não casa ` +
          `\`<bc>.<agregado>.<acao>.vN\` (o \`vN\` é o que permite evolve o contrato)`,
      );
    }
    if (corpo === null) {
      errors.push(
        `${evento.caminho}: não achei o corpo da classe ${evento.classe} — ` +
          `o gate mede os campos dentro da classe, e sem corpo não há o que medir`,
      );
      continue;
    }
    // Os CAMPOS declarados pela classe — os de classe e as parameter
    // properties do construtor (MEDIDO em 2026-11-27: a busca por
    // `readonly <campo>:` deixava passar o segredo em campo mutável e em
    // parameter property, e acusava como ausente o campo declarado sem
    // anotação de tipo).
    const declarados = new Set(propriedadesDeclaradas(corpo));
    for (const campo of CAMPOS_OBRIGATORIOS) {
      if (declarados.has(campo)) continue;
      errors.push(
        `${evento.caminho}: o evento não declara \`${campo}\` — ` +
          `todo evento de domínio carrega quando aconteceu e sobre o quê`,
      );
    }
    for (const campo of declarados) {
      if (!RE_SEGREDO.test(campo)) continue;
      errors.push(
        `${evento.caminho}: o evento declara o campo \`${campo}\` — ` +
          `evento sai do processo (log, fila, arquivo de auditoria) e segredo não sai junto`,
      );
    }
  }

  // ── ED2 — o nome do evento é único ───────────────────────────────────────
  const porNome = new Map<string, string[]>();
  for (const evento of eventos) {
    const lista = porNome.get(evento.eventName) ?? [];
    lista.push(evento.caminho);
    porNome.set(evento.eventName, lista);
  }
  for (const [nome, arquivos] of porNome) {
    if (arquivos.length > 1) {
      errors.push(
        `\`eventName\` "${nome}" é declarado em ${arquivos.length} eventos ` +
          `(${arquivos.join(', ')}) — o nome é a chave do consumidor, e chave repetida ` +
          `torna o consumidor ambíguo`,
      );
    }
  }

  // ── ED3 — o evento é emitido do domínio ──────────────────────────────────
  for (const evento of eventos) {
    for (const [caminho, conteudo] of arvore) {
      const analise = analisarDe(caminho, conteudo);
      if (!new RegExp(`\\bnew\\s+${evento.classe}\\s*[<(]`).test(analise.semStrings)) continue;
      // O arquivo tem que IMPORTAR este evento: uma classe homônima local
      // não é o evento (MEDIDO: `new UserCreatedEvent(` de uma classe local
      // acusava o evento de outro módulo).
      if (!importaClasseDoEvento(analise.codigo, caminho, evento)) continue;
      // A isenção é o DOMÍNIO do próprio módulo — não qualquer pasta chamada
      // `domain` (MEDIDO: `application/domain/z.ts` emitia sem ser acusado).
      if (caminho.includes(`/modules/${evento.modulo}${CAMINHO_DO_DOMINIO}`)) continue;
      errors.push(
        `${caminho}: constrói \`new ${evento.classe}(\` fora do domínio — ` +
          `quem emite evento é o aggregate; a camada HTTP e a de application só recebem`,
      );
    }
  }

  // ── ED4 — a dependência aponta para dentro ───────────────────────────────
  //
  // ⚠️ A regra é o DOMÍNIO que não importa a infraestrutura, e só isso.
  // MEDIDO em 2026-11-26: a primeira versão proibia QUALQUER import de
  // infraestrutura de outro módulo — e o repo tem 12 desses imports, todos
  // legítimos no NestJS: `jwt-auth.guard`, `public.decorator`,
  // `feature-flag.guard` e `permissions.guard` são artefatos de FRAMEWORK,
  // compartilhados entre módulos, e não são o acoplamento que a regra
  // event-driven quer desatar. O gate virava alarme falso em 12 linhas, e
  // alarme falso é a forma mais rápida de um gate ser desligado.
  //
  // O que a regra NÃO mede (e quem mede): o acoplamento de DADOS entre
  // módulos — um módulo importando o `infrastructure/persistence/` de outro.
  // Isso é da lens DDD/Hexagonal, e quem a aplica é o `stack-code-reviewer`.
  for (const [caminho, conteudo] of arvore) {
    if (!caminho.includes(CAMINHO_DO_DOMINIO)) continue;
    const analise = analisarDe(caminho, conteudo);
    for (const alvo of importsDe(analise.codigo)) {
      if (!alvo.includes('infrastructure')) continue;
      errors.push(
        `${caminho}: o domínio importa a infraestrutura ("${alvo}") — ` +
          `a dependência aponta para dentro; quem implementa a porta é a infraestrutura`,
      );
    }
  }

  // ── ED5 — o evento tem consumidor na camada application ─────────────────
  const violacoesED5: string[] = [];
  /** Quantas vezes cada chave aparece no medido — o registro declara a contagem. */
  const ocorrenciasED5 = new Map<string, number>();
  for (const evento of eventos) {
    const temConsumidor = [...arvore.entries()].some(([caminho, conteudo]) => {
      if (!caminho.includes(CAMINHO_DA_CAMADA_DE_APLICACAO)) return false;
      const analise = analisarDe(caminho, conteudo);
      // O consumidor tem que IMPORTAR o evento — o nome da classe solta
      // contaria um homônimo de outro módulo (MEDIDO).
      if (!importaClasseDoEvento(analise.codigo, caminho, evento)) return false;
      // E tem que USAR a classe, não só importá-la: um `import` sem uso
      // não é consumidor (MEDIDO: o `import` sozinho satisfazia o gate).
      // E o uso é medido no código SEM STRINGS: o nome da classe dentro de
      // uma string é rótulo, não uso (MEDIDO).
      // ⚠️ E o uso é por FRONTEIRA de identificador: `UserCreatedEventPayload`
      // contém o nome da classe e NÃO é uso dela (MEDIDO em 2026-11-27: o
      // evento morto passava por causa de um `type` que só o continha).
      return new RegExp(`\\b${evento.classe}\\b`).test(semImports(analise.semStrings));
    });
    if (!temConsumidor) {
      violacoesED5.push(evento.eventName);
      ocorrenciasED5.set(evento.eventName, (ocorrenciasED5.get(evento.eventName) ?? 0) + 1);
    }
  }

  // ── ED6 — o efeito colateral não é escrito direto pela application ───────
  const violacoesED6: string[] = [];
  /** Quantas vezes cada chave aparece no medido — o registro declara a contagem. */
  const ocorrenciasED6 = new Map<string, number>();
  for (const [caminho, conteudo] of arvore) {
    if (!caminho.includes(CAMINHO_DA_CAMADA_DE_APLICACAO)) continue;
    const analise = analisarDe(caminho, conteudo);
    // ⚠️ O código SEM STRINGS: `export const doc = 'await this.auditService.record({})'`
    // é um TEXTO que fala da escrita, não a escrita (MEDIDO em 2026-11-27).
    const codigo = semImports(analise.semStrings);
    for (const escrita of ESCRITAS_DE_EFEITO_COLATERAL) {
      // A CONTAGEM das chamadas: o `matchAll` exige a regex global, e a
      // original é sem `g` (o `test` não precisa). A contagem é o que o
      // registro declara — uma dívida que cresce em um arquivo e o registro
      // continua dizendo 1 é um registro que envelhece em silêncio.
      const achados = [...codigo.matchAll(new RegExp(escrita.padrao.source, 'g'))];
      if (achados.length === 0) continue;
      const chave = `${caminho}|${escrita.rotulo}`;
      if (!violacoesED6.includes(chave)) violacoesED6.push(chave);
      ocorrenciasED6.set(chave, achados.length);
    }
  }

  // ── A reconciliação com o registro ───────────────────────────────────────
  const declaradas = new Map<string, ExcecaoDeclarada>();
  for (const excecao of registro.excecoes)
    declaradas.set(`${excecao.regra}|${excecao.chave}`, excecao);

  const tratar = (regra: 'ED5' | 'ED6', chave: string, onde: string): void => {
    const excecao = declaradas.get(`${regra}|${chave}`);
    if (excecao === undefined) {
      errors.push(
        `${onde} — violação da regra ${regra} que NÃO está declarada em ` +
          `${ARQUIVO_DE_EXCECOES}. Declare a exceção com o motivo, ou corrija o código`,
      );
      return;
    }
    advisories.push(`${regra} em ${chave}: exceção declarada (${excecao.motivo})`);
  };

  for (const chave of violacoesED5) {
    const evento = eventos.find((e) => e.eventName === chave);
    tratar(
      'ED5',
      chave,
      `evento "${chave}" (${evento?.caminho ?? '?'}) não tem consumidor na camada application`,
    );
  }
  for (const chave of violacoesED6) {
    const [arquivo = '?', padrao = '?'] = chave.split('|');
    tratar('ED6', chave, `${arquivo}: escrita de efeito colateral direta (${padrao})`);
  }

  // Exceção que parou de valer: o defeito foi corrigido e a entrada ficou.
  for (const excecao of registro.excecoes) {
    const chave = `${excecao.regra}|${excecao.chave}`;
    // A entrada sem `verificacao` já foi MIÚDA na validação — e seguir para
    // a reconciliação derrubaria o gate com `TypeError` (MEDIDO em
    // 2026-11-27: o registro corrompido virava stack trace, e no preflight
    // virava "o check LANÇOU").
    if (excecao.verificacao === undefined || typeof excecao.verificacao !== 'object') continue;
    const violacoes = excecao.regra === 'ED5' ? violacoesED5 : violacoesED6;
    if (!violacoes.includes(excecao.chave)) {
      errors.push(
        `exceção declarada ${chave} parou de valer — a violação não acontece mais ` +
          `(verificação: ${excecao.verificacao.tipo}). Remova a entrada de ${ARQUIVO_DE_EXCECOES}`,
      );
      continue;
    }
    // A verificação do registro tem que BATER com o que foi medido — senão o
    // registro descreve outra coisa (MEDIDO: `padrao: "PADRAO_QUE_NAO_EXISTE"`
    // passava, porque a verificação era decorativa).
    if (excecao.regra === 'ED5') {
      const evento = eventos.find((e) => e.eventName === excecao.chave);
      if (evento !== undefined && excecao.verificacao.classe !== evento.classe) {
        errors.push(
          `exceção declarada ${chave} declara a classe "${excecao.verificacao.classe ?? ''}", ` +
            `e o evento é "${evento.classe}" — a verificação do registro não bate com o medido`,
        );
      }
    } else if (excecao.verificacao.padrao !== excecao.chave.split('|')[1]) {
      errors.push(
        `exceção declarada ${chave} declara o padrão "${excecao.verificacao.padrao ?? ''}", ` +
          `e o medido é "${excecao.chave.split('|')[1] ?? ''}" — a verificação do registro não bate com o medido`,
      );
    }
    // A CONTAGEM que o registro declara tem que ser a contagem medida — o
    // `ocorrencias` é um NÚMERO no registro, e número que ninguém mede
    // envelhece em silêncio (a dívida cresce no arquivo e o registro continua
    // dizendo 1).
    const medida =
      excecao.regra === 'ED5'
        ? (ocorrenciasED5.get(excecao.chave) ?? 0)
        : (ocorrenciasED6.get(excecao.chave) ?? 0);
    if (excecao.ocorrencias !== medida) {
      errors.push(
        `exceção declarada ${chave} declara ${excecao.ocorrencias} ocorrência(s) e o medido é ` +
          `${medida} — o registro declara a dívida, e a dívida mudou de tamanho`,
      );
    }
    // A exceção aponta para um arquivo que não existe mais: ela já não descreve
    // nada do código, e o registro deixou de ser um instrumento.
    const arquivo = excecao.verificacao.arquivo;
    if (arquivo !== undefined && !existsSync(resolve(raiz, arquivo))) {
      errors.push(
        `exceção declarada ${chave} aponta para "${arquivo}", que não existe no disco — ` +
          `a exceção descreve um código que não existe`,
      );
    }
  }

  const comConsumidor = eventos.length - violacoesED5.length;
  advisories.push(
    `medido: ${eventos.length} evento(s) de domínio em ` +
      `${new Set(eventos.map((e) => e.modulo)).size} módulo(s); ` +
      `${comConsumidor} com consumidor na camada application, ${violacoesED5.length} sem.`,
  );
  advisories.push(
    'escopo: o gate mede o NOME e a ESTRUTURA do evento, quem o emite e quem o consome ' +
      'por referência (import resolvido + uso com fronteira de identificador). NÃO mede o ' +
      'payload, a atomicidade da mutação nem se o handler faz o que promete — ver a convenção ' +
      '`event-driven.md` §4.',
  );

  return { ok: errors.length === 0, errors, advisories };
}

// Executado como CLI — o comando que a convenção manda rodar.
if (process.argv[1]?.endsWith('check-event-driven.ts')) {
  const resultado = checkEventDriven({ raiz: resolve(__dirname, '..', '..', '..') });
  for (const linha of linhasDoRelato(resultado)) process.stderr.write(`${linha}\n`);
  process.exit(resultado.ok ? 0 : 1);
}
