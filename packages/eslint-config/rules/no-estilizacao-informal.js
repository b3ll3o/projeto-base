/**
 * Regra: a classe do elemento segue o padrão de estilização do template.
 *
 * O padrão de estilo do repo está em `.agents/specs/conventions/estilizacao.md`
 * e o DONO dos valores de token é `apps/web/app/globals.css` (bloco `@theme`
 * do Tailwind 4). Esta regra é o instrumento dele: ela mede o que a convenção
 * proíbe, para que a convenção não seja só prosa.
 *
 * ## O que ela mede (3 proibições, 1 por eixo do padrão)
 *
 * 1. **Cor** — nenhuma classe da paleta stock do Tailwind (`text-slate-900`,
 *    `bg-red-50`, `border-slate-300`) e nenhum valor literal (`bg-[#fff]`).
 *    O caminho é o token semântico (`text-foreground`, `bg-surface`).
 * 2. **Raio** — só `rounded-md`. Raio é decisão de FAMÍLIA de componente,
 *    tomada uma vez (regra da skill `ui-craft` §3).
 * 3. **Sombra** — nenhuma sombra em repouso. Sombra é para o que flutua de
 *    verdade (menu, dialog); separar superfícies é passo de tom
 *    (`ui-craft` §5, "sem sombra em repouso").
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
 */
const RE_SOMBRA = /^(shadow|drop-shadow|inset-shadow)(-(sm|md|lg|xl|2xl|inner|none))?$/;

/** `shadow-[0_1px_2px_rgb(0_0_0/0.05)]` — sombra literal. */
const RE_SOMBRA_LITERAL = /^(shadow|drop-shadow|inset-shadow)-\[/;

/**
 * O raio do padrão, e SÓ ele — mas nos seus lados.
 *
 * `rounded-t-md` usa o MESMO raio (md) em um lado só, e recusá-lo seria
 * recursar o padrão (MEDIDO 2026-11-16: `rounded-t-md` era reprovado).
 */
const RE_RAIO = /^rounded(-(t|b|l|r|tl|tr|bl|br|s|e|ss|se|ee|es))?-md$/;

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

/**
 * Coleta TODAS as strings de classe de uma expressão.
 *
 * ⚠️ Só o literal e o template literal eram lidos (MEDIDO 2026-11-16): o
 * ternário (`cond ? 'text-slate-900' : 'bg-surface'`) e a chamada de helper
 * (`cn('text-slate-900')`) PASSAVAM sem leitura — e o app derivado, que é o
 * consumidor do padrão, vai usar as duas formas.
 */
function stringsDeClasse(no, coletar) {
  if (no === null || typeof no !== 'object') return;
  switch (no.type) {
    case 'Literal':
      if (typeof no.value === 'string') coletar(no.value);
      return;
    case 'TemplateLiteral':
      for (const quasi of no.quasis) coletar(quasi.value.cooked ?? '');
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
    default:
  }
}

/**
 * Nomes que DECLARAM "isto aqui é uma lista de classes".
 *
 * ⚠️ MEDIDO 2026-11-16 (revisão Next.js): a regra só olhava o `className`
 * literal, e as 8 primitivas guardam as classes em CONSTANTES
 * (`CLASSES_BOTAO.base`, `CLASSE_CONTROLE`, `CLASSE_CHECKBOX`) — ou seja, a
 * regra era cega exatamente ONDE O PADRÃO MORA. Um `text-slate-900` de volta
 * na `CLASSES_BOTAO` passava o gate.
 *
 * A regra do NOME é o contrato: quem guarda classe em constante dá o nome
 * que diz que é classe (`CLASSE_*`, `CLASSES_*`), e a regra lê esse lugar.
 */
const RE_NOME_DE_CLASSE = /(^|_)(CLASSES?|CLASS_NAMES?)(_|$)/i;

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
 * Coleta as strings de classe de um valor inicial de constante.
 *
 * Aceita a string direta e o OBJETO de classes (`CLASSES_BOTAO = { base,
 * primario, secundario }`) — que é a forma que o repo usa.
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
    },
  },
  create(context) {
    /** Acusa uma class string inteira (a posição reportada é o atributo). */
    function conferir(node, valor) {
      if (typeof valor !== 'string') return;
      for (const classe of classesDe(valor)) {
        if (RE_LITERAL.test(classe)) {
          context.report({ node, messageId: 'cor-literal', data: { classe } });
          continue;
        }
        const base = semVariante(classe);
        if (RE_PALETA.test(base)) {
          context.report({ node, messageId: 'cor-paleta', data: { classe } });
          continue;
        }
        if (RE_SOMBRA.test(base) && base !== 'shadow-none') {
          context.report({ node, messageId: 'sombra', data: { classe } });
          continue;
        }
        if (RE_SOMBRA_LITERAL.test(base)) {
          context.report({ node, messageId: 'sombra', data: { classe } });
          continue;
        }
        if (base.startsWith('rounded') && !RE_RAIO.test(base)) {
          context.report({ node, messageId: 'raio', data: { classe, raio: 'rounded-md' } });
          continue;
        }
      }
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
       */
      VariableDeclarator(node) {
        const nome = node.id && node.id.type === 'Identifier' ? node.id.name : null;
        if (nome === null || !RE_NOME_DE_CLASSE.test(nome)) return;
        stringsDeValor(node.init, (texto) => conferir(node, texto));
      },
    };
  },
};
