/**
 * Regra: a classe do elemento segue o padrão de estilização do template.
 *
 * O padrão de estilo do repo está em `.agents/specs/conventions/estilizacao.md`
 * e o DONO dos valores de token é `apps/web/app/globals.css` (bloco `@theme`
 * do Tailwind 4). Esta regra é o instrumento dele: ela mede o que a convenção
 * proíbe, para que a convenção não seja só prosa.
 *
 * ## O que ela mede (4 proibições, 1 por eixo do padrão)
 *
 * 1. **Cor** — nenhuma classe da paleta stock do Tailwind (`text-slate-900`,
 *    `bg-red-50`, `border-slate-300`) e nenhum valor literal (`bg-[#fff]`).
 *    O caminho é o token semântico (`text-foreground`, `bg-surface`).
 * 2. **Raio** — só `rounded-md`. Raio é decisão de FAMÍLIA de componente,
 *    tomada uma vez (regra da skill `ui-craft` §3).
 * 3. **Sombra** — nenhuma sombra em repouso. Sombra é para o que flutua de
 *    verdade (menu, dialog); separar superfícies é passo de tom
 *    (`ui-craft` §5, "sem sombra em repouso").
 * 4. **Anel de foco que transita** — `foco` (o utilitário de foco do padrão)
 *    junto de `transition-colors`: a transição padrão do Tailwind inclui
 *    `outline-color`, e o anel passava a SURGIR em 150ms (MEDIDO 2026-11-16
 *    no browser). Onde há anel, a transição é da propriedade que PRECISA
 *    transicionar.
 * 5. **`outline-none` sem substituto** — apagar o anel do browser sem
 *    devolvê-lo é foco inconsistente: a regra exige que o `foco` (o
 *    utilitário do padrão) esteja na MESMA class string.
 *
 * ## O que ela NÃO mede (e por quê)
 *
 * - **Hierarquia tipográfica** (`text-2xl` vs `text-lg`) — o papel de cada
 *   tamanho é contexto de tela, não propriedade mecânica da classe.
 * - **Espaçamento** — o vão é orçamento de tela, e a escala do Tailwind já
 *   é a régua.
 * - **Se o token existe** — a regra não lê o `globals.css`; quem garante que
 *   o token declarado é o token usado é a revisão.
 * - **Contraste** — o contraste medido é humano (a skill `ui-craft` §6 o
 *   lista como medido, não estimado).
 *
 * ## A exceção
 *
 * `eslint-disable-next-line` funciona, como em toda regra. A convenção
 * declara quando ele é legítimo: **só** para o que flutua de verdade (menu,
 * dialog, popover) — e o uso é para ser notado na revisão, não para ser
 * comum.
 */

/**
 * A paleta stock do Tailwind — a segunda fonte de cor, que o padrão proíbe.
 *
 * ⚠️ A lista é EXPLÍCITA, e não "qualquer nome em minúsculas": com a lista
 * explícita, `text-sm` (tamanho) e `text-primary` (token do padrão) não
 * precisam ser filtrados depois — eles simplesmente não casam.
 */
const PALETA_STOCK = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  // As duas cores literais do Tailwind. Não têm número de tom, e por isso
  // não cabiam na regra que exige `50`/`100`/`900` — e `text-white` era
  // exatamente o que os botões primários usavam antes do padrão.
  'white',
  'black',
];

/** Utilitárias que recebem cor. */
const PREFIXOS_DE_COR = [
  'text',
  'bg',
  'border',
  'ring',
  'ring-offset',
  'outline',
  'decoration',
  'fill',
  'stroke',
  'caret',
  'accent',
  'from',
  'via',
  'to',
  'divide',
  'shadow',
  'placeholder',
  'mask',
];

/**
 * `text-slate-900`, `bg-red-50`, `border-slate-300`, `text-white`…
 *
 * ⚠️ A cor é o ÚLTIMO segmento, e pode vir depois de um modificador de
 * LADO (`border-t-slate-200`, `divide-y-slate-200`) — MEDIDO 2026-11-16: com a
 * cor presa ao fim (`^prefix-cor$`), `border-t-slate-200` PASSAVA, e essa é
 * a forma mais comum de borda do Tailwind.
 *
 * A opacidade aceita o número (`/50`) e o arbitrário (`/[0.5]`), e o `!` final
 * é o "importante" do Tailwind 4 (`bg-slate-900!`).
 */
const RE_PALETA = new RegExp(
  `^(?:${PREFIXOS_DE_COR.join('|')})(?:-[a-z0-9]+)*-(?:${PALETA_STOCK.join('|')})` +
    `(?:-\\d{2,3})?(?:/(?:\\d{1,3}|\\[[^\\]]+\\]))?!?$`,
);

/** `bg-[#fff]`, `text-[rgb(0,0,0)]`, `border-[hsl(0_0%_0%)]`. */
const RE_LITERAL = new RegExp(
  `^(${PREFIXOS_DE_COR.join('|')})-\\[(#|rgb|hsl|hwb|lab|lch|oklab|oklch|color:)`,
);

/**
 * `shadow-sm`, `shadow-lg`… e as famílias irmãs `drop-shadow-*` e
 * `inset-shadow-*` (MEDIDO 2026-11-16: as duas PASSAVAM, e a convenção
 * §2.3 diz que o sistema não tem sombra nenhuma).
 *
 * ⚠️ `xs` e `2xs` estão aqui porque o Tailwind 4 os tem (MEDIDO 2026-11-16:
 * a regra, escrita contra a escala do Tailwind 3, deixava `shadow-xs` e
 * `shadow-2xs` PASSAREM — e `shadow-xs` é a MENOR sombra do Tailwind 4).
 */
const RE_SOMBRA = /^(shadow|drop-shadow|inset-shadow)(-(2xs|xs|sm|md|lg|xl|2xl|inner|none))?$/;

/** `shadow-[0_1px_2px_rgb(0_0_0/0.05)]` — sombra literal. */
const RE_SOMBRA_LITERAL = /^(shadow|drop-shadow|inset-shadow)-\[/;

/**
 * O raio do padrão, e SÓ ele — mas nos seus lados.
 *
 * `rounded-t-md` usa o MESMO raio (md) em um lado só, e recusá-lo seria
 * recusar o padrão (MEDIDO 2026-11-16: `rounded-t-md` era reprovado).
 */
const RE_RAIO = /^rounded(-(t|b|l|r|tl|tr|bl|br|s|e|ss|se|ee|es))?-md$/;

/**
 * `rounded-none` — a escolha de NÃO arredondar.
 *
 * ⚠️ É a mesma semântica do `shadow-none`: a classe que DIZ "sem". Negar
 * `rounded-none` é negar a forma de escrever "isto aqui é reto", que é uma
 * escolha legítima de família — e o padrão proíbe o raio FORA de `rounded-md`,
 * não a ausência de raio (MEDIDO 2026-11-16).
 */
const SEM_RAIO = 'rounded-none';

/**
 * O utilitário de FOCO do padrão — o único foco do sistema.
 *
 * O nome é o do utilitário `@utility foco` de `apps/web/app/globals.css`.
 */
const UTILITARIO_DE_FOCO = 'foco';

/**
 * A transição que transiciona o anel de foco junto.
 *
 * `transition-colors` transiciona `color`, `background-color`, `border-color`
 * E `outline-color` — e o anel do padrão é `outline`. O anel passava a
 * SURGIR em 150ms (MEDIDO 2026-11-16 no browser).
 */
const TRANSICAO_DE_COR = 'transition-colors';

/**
 * Separa uma class string em classes.
 *
 * O separador é o ESPAÇO — mas um valor arbitrário pode CONTER espaço
 * (`content-['a b']`), e um valor que se parte no meio deixa de ser a classe
 * que a pessoa escreveu. Por isso a fiação respeita o colchete: `bg-[#fff]`
 * é UMA classe, e não `bg-[#fff]` + `]`.
 */
function classesDe(valor) {
  if (typeof valor !== 'string') return [];
  const classes = [];
  let atual = '';
  let dentro = 0;
  for (const ch of valor) {
    if (ch === '[') dentro += 1;
    if (ch === ']') dentro -= 1;
    if (/\s/.test(ch) && dentro === 0) {
      if (atual !== '') classes.push(atual);
      atual = '';
      continue;
    }
    atual += ch;
  }
  if (atual !== '') classes.push(atual);
  return classes;
}

/**
 * Tira o que NÃO é a classe: o prefixo de variante e o sufixo de opacidade.
 *
 * `hover:bg-slate-700` → `bg-slate-700`; `dark:focus:border-slate-900` →
 * `border-slate-900`; `bg-slate-900/50` → `bg-slate-900`.
 *
 * ⚠️ SEM isto a regra deixa passar a maioria da paleta stock: no app, as
 * classes de cor com variante (`hover:bg-slate-700`, `focus:border-slate-900`,
 * `aria-[invalid=true]:border-red-500`) são a REGRA, e não a exceção.
 * MEDIDO 2026-11-11: com o regex ancorado em `^…$`, as quatro passaram.
 *
 * O `:` só separa quando está FORA de colchete — `bg-[hsl(0_0%_0%)]` tem dois
 * `:` dentro do valor e não é variante nenhuma.
 */
function semVariante(classe) {
  let resultado = '';
  let dentro = 0;
  for (const ch of classe) {
    if (ch === '[') dentro += 1;
    if (ch === ']') dentro -= 1;
    if (ch === ':' && dentro === 0) {
      resultado = ''; // a variante vem antes: o que importa é o depois
      continue;
    }
    resultado += ch;
  }
  return resultado;
}

/** Tira o embrulho de tipo (`as const`, `satisfies`, parênteses). */
function desembrulha(no) {
  if (no === null || typeof no !== 'object') return no;
  if (
    no.type === 'TSAsExpression' ||
    no.type === 'TSSatisfiesExpression' ||
    no.type === 'TSTypeAssertion' ||
    no.type === 'TSNonNullExpression' ||
    no.type === 'ParenthesizedExpression'
  ) {
    return desembrulha(no.expression);
  }
  return no;
}

/**
 * Nomes que DECLARAM "isto aqui é uma lista de classes".
 *
 * ⚠️ O nome é um INDÍCIO, não o contrato: a regra resolve o VALOR da
 * constante (ver `resolverValor`), e por isso enxerga também as que se
 * chamam `base`. O nome continua sendo a convenção do repo — quem guarda
 * classe em constante dá o nome que diz que é classe (`CLASSE_*`,
 * `CLASSES_*`) — e o padrão casa para LER o valor de uma constante que está
 * NO MESMO ARQUIVO, que é o caso em que a resolução por escopo funciona.
 *
 * A leitura pelo nome continua valendo para a constante IMPORTADA de outro
 * arquivo (é o caso do `CLASSES_BOTAO_SECUNDARIO`, importado pelo
 * `guard-admin.tsx`): a referência não é resolvível dentro do arquivo, e o
 * nome é a única pista.
 */
const RE_NOME_DE_CLASSE = /(^|_)(CLASSES?|CLASS_NAMES?)(_|$)/i;

/**
 * O `init` da declaração que vale para um identificador — ou `null`.
 *
 * ⚠️ A resolução é pelo ESCOPO, e não pelo nome: o escopo sabe qual
 * declaração vale (uma variável local sombreia a de módulo), e é ele que
 * entrega o `init`.
 *
 * ⚠️ Só a declaração de VARIÁVEL entra. Um `import` é uma `def` de outro
 * tipo — e a constante importada de outro arquivo não é resolvível aqui (a
 * leitura dela é pelo nome, em `RE_NOME_DE_CLASSE`).
 */
function initDoIdentificador(no, context) {
  let escopo = context.sourceCode.getScope(no);
  while (escopo !== null && escopo !== undefined) {
    const variavel = escopo.set.get(no.name);
    if (variavel !== undefined) {
      for (const def of variavel.defs) {
        if (def.type === 'Variable' && def.node && def.node.init) return def.node.init;
      }
    }
    escopo = escopo.upper;
  }
  return null;
}

/**
 * Resolve um identificador (ou membro) até o NÓ que guarda o VALOR.
 *
 * ⚠️ MEDIDO 2026-11-16 (revisão do PR #168): a regra lia a constante de
 * classe pelo NOME (`CLASSE_*`/`CLASSES_*`), e 4 das 9 primitivas guardam a
 * classe em `const base` — que não casa. A regra era CEGA em 6 dos 11
 * componentes que ela deveria medir, e a §7 da convenção afirmava o
 * contrário.
 *
 * Resolvendo pelo VALOR, o NOME deixa de ser o contrato: um rename
 * (`CLASSE_CONTROLE` → `ESTILO_CONTROLE`) não abre mais o furo, porque o que
 * a regra lê é a classe que a constante GUARDA.
 */
function resolverValor(no, context) {
  const nu = desembrulha(no);
  if (nu === null || typeof nu !== 'object') return null;
  if (nu.type === 'Identifier') {
    const init = initDoIdentificador(nu, context);
    return init === null ? null : desembrulha(init);
  }
  if (nu.type === 'MemberExpression') {
    const objeto = resolverValor(nu.object, context);
    if (objeto === null || objeto.type !== 'ObjectExpression') return null;
    // A chave dinâmica (`CLASSES[variante]`) não diz qual é — o objeto
    // inteiro é lido, que é o comportamento seguro.
    if (nu.computed) return objeto;
    const chave = nu.property.type === 'Identifier' ? nu.property.name : String(nu.property.value);
    for (const propriedade of objeto.properties) {
      if (propriedade.type !== 'Property' || propriedade.computed) continue;
      const nome =
        propriedade.key.type === 'Identifier'
          ? propriedade.key.name
          : String(propriedade.key.value);
      if (nome === chave) return desembrulha(propriedade.value);
    }
    return null;
  }
  return nu;
}

/**
 * O leitor de classes: percorre uma expressão e coleta as strings de classe.
 *
 * O `context` é o que dá acesso ao ESCOPO — e é por ele que um identificador
 * vira o valor que ele guarda.
 */
function criarLeitor(context) {
  /** Os nós já lidos — o ciclo (`const a = b; const b = a;`) é real. */
  const vistos = new Set();

  /**
   * Coleta TODAS as strings de classe de uma expressão.
   *
   * ⚠️ Só o literal e o template literal eram lidos (MEDIDO 2026-11-16): o
   * ternário (`cond ? 'text-slate-900' : 'bg-surface'`) e a chamada de helper
   * (`cn('text-slate-900')`) PASSAVAM sem leitura — e o app derivado, que é o
   * consumidor do padrão, vai usar as duas formas.
   *
   * ⚠️ As EXPRESSÕES do template literal entram na leitura (MEDIDO
   * 2026-11-16): é em `${base}` que a primitiva guarda a classe, e sem esta
   * leitura a regra era cega nas 4 primitivas que usam `const base`.
   */
  function stringsDeClasse(no, coletar) {
    if (no === null || typeof no !== 'object') return;
    if (vistos.has(no)) return;
    vistos.add(no);
    switch (no.type) {
      case 'Literal':
        if (typeof no.value === 'string') coletar(no.value);
        return;
      case 'TemplateLiteral':
        for (const quasi of no.quasis) coletar(quasi.value.cooked ?? '');
        for (const expressao of no.expressions) stringsDeClasse(expressao, coletar);
        return;
      case 'ConditionalExpression':
        stringsDeClasse(no.consequent, coletar);
        stringsDeClasse(no.alternate, coletar);
        return;
      case 'LogicalExpression':
        stringsDeClasse(no.left, coletar);
        stringsDeClasse(no.right, coletar);
        return;
      case 'CallExpression':
        for (const argumento of no.arguments) stringsDeClasse(argumento, coletar);
        return;
      case 'ArrayExpression':
        for (const elemento of no.elements) stringsDeClasse(elemento, coletar);
        return;
      case 'Identifier':
        stringsDeValor(resolverValor(no, context), coletar);
        return;
      case 'MemberExpression':
        stringsDeValor(resolverValor(no, context), coletar);
        return;
      default:
    }
  }

  /**
   * Coleta as strings de classe de um VALOR — a string direta, o OBJETO de
   * classes (`CLASSES_BOTAO = { base, primario, secundario }`) ou o ARRAY.
   */
  function stringsDeValor(no, coletar) {
    const nu = desembrulha(no);
    if (nu === null || typeof nu !== 'object') return;
    if (nu.type === 'ObjectExpression') {
      for (const propriedade of nu.properties) {
        if (propriedade.type === 'Property') stringsDeValor(propriedade.value, coletar);
      }
      return;
    }
    if (nu.type === 'ArrayExpression') {
      for (const elemento of nu.elements) stringsDeValor(elemento, coletar);
      return;
    }
    stringsDeClasse(nu, coletar);
  }

  return { stringsDeClasse, stringsDeValor };
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A classe do elemento segue o padrão de estilização: token semântico, raio único e sem sombra em repouso.',
    },
    schema: [],
    messages: {
      'cor-paleta':
        'Cor da paleta stock do Tailwind ("{{classe}}"). Use o token semântico do padrão (ver apps/web/app/globals.css).',
      'cor-literal':
        'Valor de cor literal ("{{classe}}"). O padrão é o token semântico (ver apps/web/app/globals.css).',
      raio: 'Raio fora do padrão ("{{classe}}"). O padrão tem UM raio: {{raio}}.',
      sombra:
        'Sombra em repouso ("{{classe}}"). No padrão, sombra é só para o que flutua; superfície separada por passo de tom.',
      'foco-transicao':
        'Anel de foco com transição de cor ("{{classe}}"). `transition-colors` transiciona `outline-color` também, e o anel passava a surgir em 150ms. Use a transição da propriedade que precisa transicionar.',
      'outline-none-sem-substituto':
        '`outline-none` sem substituto ("{{classe}}"). O foco do padrão é o utilitário `foco`: apagar o anel do browser sem devolvê-lo deixa a tela com dois sistemas de foco.',
    },
  },
  create(context) {
    const { stringsDeClasse, stringsDeValor } = criarLeitor(context);

    /**
     * As violações já acusadas neste ARQUIVO.
     *
     * ⚠️ A regra lê a classe por DOIS caminhos (a constante pelo nome e o uso
     * pelo valor resolvido) — e as duas vezes acusam a MESMA classe. Sem esta
     * memória, cada violação apareceria DUAS vezes no relatório.
     */
    const acusadas = new Set();

    /** Acusa uma class string inteira (a posição reportada é o atributo). */
    function conferir(node, valor) {
      if (typeof valor !== 'string') return;
      const classes = classesDe(valor);

      // O anel de foco que transita (MEDIDO 2026-11-16): a combinação é o
      // defeito, e nenhuma classe sozinha é proibida.
      const temFoco = classes.some((c) => semVariante(c) === UTILITARIO_DE_FOCO);
      const temTransicao = classes.some((c) => semVariante(c) === TRANSICAO_DE_COR);
      if (temFoco && temTransicao) {
        acusar(node, 'foco-transicao', TRANSICAO_DE_COR);
      }

      // `outline-none` sem substituto: apagar o anel do browser sem
      // devolvê-lo é a receita da §4.3 do padrão — e a regra pode MEDIR
      // porque o substituto (`foco`) está na MESMA class string.
      const temOutlineNone = classes.some((c) => semVariante(c) === 'outline-none');
      if (temOutlineNone && !temFoco) {
        acusar(node, 'outline-none-sem-substituto', 'outline-none');
      }

      for (const classe of classes) {
        if (RE_LITERAL.test(classe)) {
          acusar(node, 'cor-literal', classe);
          continue;
        }
        const base = semVariante(classe);
        if (RE_PALETA.test(base)) {
          acusar(node, 'cor-paleta', classe);
          continue;
        }
        if (RE_SOMBRA.test(base) && !base.endsWith('-none')) {
          acusar(node, 'sombra', classe);
          continue;
        }
        if (RE_SOMBRA_LITERAL.test(base)) {
          acusar(node, 'sombra', classe);
          continue;
        }
        if (base.startsWith('rounded') && base !== SEM_RAIO && !RE_RAIO.test(base)) {
          acusar(node, 'raio', classe);
          continue;
        }
      }
    }

    /** Acusa uma vez só: a mesma classe não é contada duas vezes. */
    function acusar(node, messageId, classe) {
      const chave = `${messageId}|${classe}`;
      if (acusadas.has(chave)) return;
      acusadas.add(chave);
      const data = messageId === 'raio' ? { classe, raio: 'rounded-md' } : { classe };
      context.report({ node, messageId, data });
    }

    return {
      JSXAttribute(node) {
        const nome = node.name && node.name.type === 'JSXIdentifier' ? node.name.name : null;
        if (nome !== 'className' && nome !== 'class') return;
        const valor = node.value;
        if (!valor) return;
        if (valor.type === 'Literal' && typeof valor.value === 'string') {
          conferir(node, valor.value);
          return;
        }
        if (valor.type === 'JSXExpressionContainer') {
          stringsDeClasse(valor.expression, (texto) => conferir(node, texto));
        }
      },

      /**
       * As CONSTANTES de classe.
       *
       * ⚠️ É o alcance que faltava: as primitivas guardam as classes em
       * constantes, e a regra precisa medir ONDE O PADRÃO MORA.
       *
       * ⚠️ MEDIDO 2026-11-16 (revisão do PR #168): esta leitura era pelo
       * NOME, e 4 das 9 primitivas guardam a classe em `const base` — que
       * não casa. A regra era cega em 6 dos 11 componentes exportados. Agora
       * o alcance é o VALOR (via `resolverValor`), e o nome é só o indício
       * para a constante que vem de OUTRO arquivo.
       */
      VariableDeclarator(node) {
        const nome = node.id && node.id.type === 'Identifier' ? node.id.name : null;
        if (nome === null || !RE_NOME_DE_CLASSE.test(nome)) return;
        stringsDeValor(node.init, (texto) => conferir(node, texto));
      },
    };
  },
};
