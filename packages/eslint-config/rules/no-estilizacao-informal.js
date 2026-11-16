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

/** A paleta stock do Tailwind — a segunda fonte de cor, que o padrão proíbe. */
const PALETA_STOCK = new Set([
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
]);

/**
 * Cores que NÃO são escolha de cor e por isso passam.
 *
 * `transparent` é "sem cor" e `current` é "a cor do pai". Nenhum dos dois
 * pode ser convertido em token sem perder o sentido.
 */
const CORES_NEUTRAS = new Set(['transparent', 'current', 'inherit']);

/** Utilitárias que recebem cor. */
const PREFIXOS_DE_COR = [
  'text',
  'bg',
  'border',
  'ring',
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
];

/** O único raio do padrão. */
const RAIO_UNICO = 'rounded-md';

/**
 * `text-slate-900`, `bg-red-50`, `border-slate-300`, `text-white`…
 *
 * O número do tom é OPCIONAL porque `white` e `black` não têm tom — e o
 * número, quando existe, é o que distingue a paleta de `text-sm` (tamanho)
 * e de `text-2xl` (tamanho): nenhum dos dois casa, porque o nome é uma
 * palavra do Tailwind que não está na paleta.
 */
const RE_PALETA = new RegExp(`^(${PREFIXOS_DE_COR.join('|')})-([a-z]+)(-\\d{2,3})?(/\\d{1,3})?$`);

/** `bg-[#fff]`, `text-[rgb(0,0,0)]`, `border-[hsl(0_0%_0%)]`. */
const RE_LITERAL = new RegExp(
  `^(${PREFIXOS_DE_COR.join('|')})-\\[(#|rgb|hsl|hwb|lab|lch|oklab|oklch|color:)`,
);

/** `shadow-sm`, `shadow-lg`… (a cor de sombra também entra pela paleta). */
const RE_SOMBRA = /^shadow(-(sm|md|lg|xl|2xl|inner|none))?$/;

/** `shadow-[0_1px_2px_rgb(0_0_0/0.05)]` — sombra literal. */
const RE_SOMBRA_LITERAL = /^shadow-\[/;

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
  return resultado.replace(/\/\d{1,3}$/, '');
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
        const paleta = RE_PALETA.exec(base);
        if (paleta && !CORES_NEUTRAS.has(paleta[2])) {
          if (PALETA_STOCK.has(paleta[2])) {
            context.report({ node, messageId: 'cor-paleta', data: { classe } });
            continue;
          }
        }
        if (RE_SOMBRA.test(base) && base !== 'shadow-none') {
          context.report({ node, messageId: 'sombra', data: { classe } });
          continue;
        }
        if (RE_SOMBRA_LITERAL.test(base)) {
          context.report({ node, messageId: 'sombra', data: { classe } });
          continue;
        }
        if (base.startsWith('rounded') && base !== RAIO_UNICO) {
          context.report({ node, messageId: 'raio', data: { classe, raio: RAIO_UNICO } });
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
          const expressao = valor.expression;
          if (!expressao) return;
          if (expressao.type === 'Literal' && typeof expressao.value === 'string') {
            conferir(node, expressao.value);
            return;
          }
          if (expressao.type === 'TemplateLiteral') {
            for (const quasi of expressao.quasis) conferir(node, quasi.value.cooked ?? '');
          }
        }
      },
    };
  },
};
