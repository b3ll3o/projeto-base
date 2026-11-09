/**
 * O frontmatter de um arquivo do template — **fonte única** do parser.
 *
 * ## Por que um módulo só
 *
 * Duas camadas leem frontmatter: a dos **agents** (`.agents/agents/<n>.md`) e
 * a das **skills** (`.agents/skills/<n>/SKILL.md`). Cada uma tinha o seu
 * parser, e eles discordavam: o de agent pegava a **primeira** ocorrência de
 * uma chave, o de skill a **última**. O mesmo arquivo, dois veredictos — e
 * nenhum dos dois viajava a forma que o YAML de verdade produz.
 *
 * O que o YAML de verdade produz, e que os dois parsers deixavam passar:
 *
 * - `description: # TODO` — o valor é **null** (o `#` abre um comentário). O
 *   agent fica sem **gatilho**: o Claude Code não descobre quando usá-lo.
 * - `tools: []`, `tools: null`, `tools: ~` — lista vazia/null: o subagent
 *   herda a pool inteira, que é o desvio silencioso.
 * - `tools:` + `- ""` — lista com item vazio: mesma coisa.
 * - frontmatter **sem o `---` que fecha**: o bloco não existe, e um parser
 *   que lê até o fim do arquivo lê o **corpo** como se fosse frontmatter.
 * - chave **repetida**: YAML de chave duplicada é inválido (o `js-yaml`
 *   lança) ou "last-wins" — nos dois casos o harness não registra o
 *   arquivo como ele diz.
 *
 * ## O que este módulo NÃO decide
 *
 * Ele **lê**; quem **julga** é o gate. O módulo devolve o campo, a linha, o
 * valor e se o valor está **de fato vazio** — e a lista de campos, para que
 * o gate possa acusar chave repetida.
 */

/** Um campo lido do frontmatter. */
export interface CampoFrontmatter {
  /** O nome do campo, como está no arquivo. */
  campo: string;
  /** O valor normalizado: sem aspas envolventes, sem comentário, bloco unido. */
  texto: string;
  /** A linha (1-based) da chave. */
  linha: number;
  /**
   * O valor está **de fato** vazio.
   *
   * Não é "a linha acabou depois dos dois-pontos": é o valor que o YAML
   * entregaria ao harness. `description: # TODO` é vazio (comentário),
   * `tools: []` é vazio (lista vazia), `tools: null` é vazio (null).
   */
  vazio: boolean;
}

/** O frontmatter lido. */
export interface FrontmatterLido {
  /** Os campos, na ordem em que aparecem — repetidos entram todos. */
  campos: CampoFrontmatter[];
  /**
   * A linha do `---` que **fecha** o bloco.
   *
   * `null` quando o bloco não fecha — e nesse caso o arquivo **não tem**
   * frontmatter, por mais que o corpo tenha linhas com `:`.
   */
  fecha: number | null;
  /** O arquivo abre com `---`? */
  abre: boolean;
}

/** As strings que o YAML trata como null. */
const NULLS = new Set(['null', 'Null', 'NULL', '~']);

/**
 * Corta o comentário de linha de um valor — o `#` que abre comentário, fora
 * de aspas.
 *
 * `description: d # TODO` → `d`; `description: "# não é comentário"` → o
 * texto inteiro.
 */
function semComentario(valor: string): string {
  let dentroDeAspas = false;
  let aspas = '';
  for (let i = 0; i < valor.length; i++) {
    const c = valor[i]!;
    if (dentroDeAspas) {
      if (c === aspas) dentroDeAspas = false;
      continue;
    }
    if (c === '"' || c === "'") {
      dentroDeAspas = true;
      aspas = c;
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(valor[i - 1]!))) return valor.slice(0, i);
  }
  return valor;
}

/** Tira as aspas envolventes — o valor é o que está DENTRO delas. */
function semAspas(valor: string): string {
  const cercado = /^(['"])([\s\S]*)\1$/.exec(valor);
  return cercado === null ? valor : cercado[2]!.trim();
}

/**
 * O valor de UMA linha de campo, com o Estado de "vazio de verdade".
 *
 * @param bruto o texto depois dos dois-pontos.
 * @param continuacoes as linhas indentadas seguintes (vazio se não houver).
 */
function valorDe(bruto: string, continuacoes: string[]): { texto: string; vazio: boolean } {
  const linha = bruto.trim();

  // Comentário de linha: o valor é null.
  if (linha.startsWith('#')) return { texto: '', vazio: true };

  // Valor em bloco (`>`, `|`) ou lista indentada: o valor são as continuações.
  if (linha === '' || /^[>|][+-]?$/.test(linha)) {
    const itens = continuacoes.map((c) => c.trim());
    const preenchidos = itens.filter((i) => i !== '' && !i.startsWith('#'));
    const texto = preenchidos
      .map((i) => (i.startsWith('- ') ? i.slice(2).trim() : i))
      .join(' ')
      .trim();
    // Uma lista de itens vazios (`- ""`) é vazia; um item com texto não é.
    const listaDeVazios =
      preenchidos.length > 0 && preenchidos.every((i) => /^-?\s*(['"])\1$/.test(i) || i === '-');
    return { texto, vazio: preenchidos.length === 0 || listaDeVazios };
  }

  const semComent = semComentario(linha).trim();

  // Lista vazia explícita.
  if (semComent === '[]') return { texto: '[]', vazio: true };

  // Null do YAML.
  if (NULLS.has(semComent)) return { texto: semComent, vazio: true };

  const texto = semAspas(semComent);
  return { texto, vazio: texto === '' };
}

/**
 * Lê o frontmatter de um arquivo.
 *
 * O bloco é o `---` da primeira linha e o `---` que o fecha. Se o `---` que
 * fecha **não existe**, o arquivo não tem frontmatter — e o corpo não é
 * lido como se tivesse.
 */
export function lerFrontmatter(texto: string): FrontmatterLido {
  // O BOM (U+FEFF) que o editor do Windows às vezes escreve antes da
  // primeira linha não é parte do frontmatter — mas ele faz o arquivo não
  // abrir com `---`.
  const limpo = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  // `\r?\n` e não `\n`: com CRLF, o `\r` fica no fim de cada linha.
  const linhas = limpo.split(/\r?\n/);

  if (linhas[0]?.trim() !== '---') return { campos: [], fecha: null, abre: false };

  const campos: CampoFrontmatter[] = [];
  let fecha: number | null = null;

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i]!;
    if (linha.trim() === '---') {
      fecha = i + 1;
      break;
    }

    const encontrado = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(linha);
    if (encontrado === null) continue;

    // As continuações indentadas são o valor, quando a chave não tem valor
    // na própria linha (lista, ou bloco dobrado).
    const continuacoes: string[] = [];
    for (let j = i + 1; j < linhas.length; j++) {
      const proxima = linhas[j]!;
      if (proxima.trim() === '---') break;
      if (proxima.trim() === '') continue;
      if (!/^\s/.test(proxima)) break;
      continuacoes.push(proxima);
    }

    const { texto: valor, vazio } = valorDe(encontrado[2]!, continuacoes);
    campos.push({ campo: encontrado[1]!, texto: valor, linha: i + 1, vazio });
  }

  return { campos, fecha, abre: true };
}

/**
 * Os campos de uma chave, na ordem — repetidos entram todos.
 *
 * A chave repetida é um erro por si (YAML não aceita), e quem julga é o
 * gate; aqui só se mede.
 */
export function camposDe(campos: CampoFrontmatter[], chave: string): CampoFrontmatter[] {
  return campos.filter((c) => c.campo === chave);
}
