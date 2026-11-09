/**
 * SEM shebang, de propósito — ver `check-harness-owner.ts`: um arquivo de
 * `.tooling/scripts/ci/` que não comece com `check-`, não termine em
 * `.spec.ts` e TENHA shebang é classificado como harness órfão.
 *
 * Mede a **cobertura da camada de skills** — a mesma pergunta que
 * `check-doc-coverage` faz para BC, rota e package, aplicada a
 * `.agents/skills/`.
 *
 * ## A lacuna que este gate fecha
 *
 * MEDIDO 2026-11-05: o repo tem **29 skills** em `.agents/skills/` e **4
 * pontos de registro** que as convenções exigem e NENHUM gate media:
 *
 * | Ponto de registro           | Onde a regra está             | O que faltava                                   |
 * |-----------------------------|-------------------------------|--------------------------------------------------|
 * | **Indexada no `AGENTS.md`**  | `AGENTS.md` §3.2              | `ddd-hexagonal-validation` e `docker` sem entrada |
 * | **Alcançável**               | `find-skills` §5 passo 4       | `find-skills` sem agent que a carregue            |
 * | **Reciproca**                | `find-skills` §5 passo 4       | skill que declara "Quem invoca: X" e X não a cita |
 * | **Descobrível**              | `AGENTS.md` §1.3              | o frontmatter que o harness lê para achar a skill |
 *
 * O `check-agent-routing-coverage` mede o lado dos **agents** (órfão e
 * fantasma, os dois sentidos). O lado das **skills** não tinha nenhum
 * instrumento: uma skill pode existir, não ser citada em lugar nenhum, e
 * ninguém perceber — porque `README.md` conta skills por `ls`, e a contagem
 * não diz se elas estão **registradas**.
 *
 * ⚠️ **Contagem não é cobertura.** MEDIDO 2026-11-05: contar os `SKILL.md`
 * de `.agents/skills/` dá 29, e as 29 existem. Mas `grep -c ddd-hexagonal-
 * validation AGENTS.md` = 0, e a skill é citada por 3 agents — ela existe,
 * é usada, e **não está indexada**. A contagem do README estava certa e a
 * cobertura mesmo assim não.
 *
 * ⚠️ **A barra seguida de asterisco fecha um comentário de bloco.** O comando
 * de contagem acima precisa ser escrito sem essa sequência: o glob de skills
 * termina com barra e o nome do arquivo começa com asterisco, e escrever os
 * dois seguido fecha o cabeçalho e o arquivo nem compila (MEDIDO 2026-11-05:
 * `Unexpected "*"` do esbuild, na linha 28). Por isso o comando está
 * reescrito aqui, e o glob real está em {@link DIR_SKILLS}.
 *
 * ## As 5 regras, e por que cada uma existe
 *
 * 1. **INDEXADA** — a skill é citada no `AGENTS.md`. O `AGENTS.md` é o
 *    índice canônico de skills do repo (é o que o `README.md` aponta: "29
 *    skills … (agent↔skill: AGENTS.md §3.2)"). Uma skill fora dele é
 *    invisível para quem lê o índice — que é o caminho de descoberta.
 * 2. **ALCANÇÁVEL** — a skill é citada por algum **agent**, **workflow** ou
 *    **outra skill**. É o "órfã" do `find-skills` §5 passo 4 ("a skill sem
 *    agent que a carregue é órfã"), com o alcance medido como o repo de
 *    fato o usa.
 *
 *    ⚠️ **A primeira versão desta regra media só `agents/`, e dava falso
 *    positivo em 3 skills.** MEDIDO 2026-11-05: `demand-archiving` é citada
 *    por 2 workflows (`archive-demand`, `pr-pendencias`) e por 2 skills
 *    (`grilling`, `state-aware-planning`), mas por **nenhum** agent; e
 *    `learning-observation` é citada pela skill `retrospective-capture` e
 *    pela convenção, também por nenhum agent. Um gate que acusa as duas
 *    está medindo a **categoria** do dono (agent × workflow × skill), não a
 *    alcançabilidade — e obriga o repo a inventar um agent para uma skill
 *    que já é executada por um workflow. A regra mede **alcance**, e o
 *    alcance inclui os três.
 * 3. **RECÍPROCA** — a skill declara `**Quem invoca:** <agent>` e esse
 *    agent **não a cita de volta**. É o drift mais caro dos cinco, porque
 *    os dois lados estão errados: a skill aponta para um dono que não sabe
 *    que ela existe. MEDIDO 2026-11-05: `find-skills` declara "Quem invoca:
 *    `specialist-router`" e o `specialist-router.md` não menciona
 *    `find-skills` — a skill de descoberta do repo é invisível para o
 *    roteador que deveria procurá-la.
 * 4. **DESCOBRÍVEL** — o frontmatter do `SKILL.md` canônico tem `name` e
 *    `description` não vazios, e o `name` é igual ao nome do diretório.
 *
 *    MEDIDO 2026-11-09: a pasta `.claude/` **não existe mais** neste repo
 *    (ver `AGENTS.md` §1.3 e o gate `check-pasta-unica`), e o `SKILL.md`
 *    canônico **é** o arquivo que o harness lê — a sonda com `.claude` como
 *    symlink para `.agents` descobriu as 30 skills e os 28 agents **sem
 *    wrapper nenhum**. O wrapper deixou de ser o que tornava a skill
 *    descobrível; o que a torna descobrível é o frontmatter do próprio
 *    arquivo. A regra que existia antes (COM BINDING) media a existência de
 *    uma cópia — e a cópia é justamente o que a regra nova impede.
 *
 *    `name` igual ao diretório não é vaidade: o binding do Claude Code é um
 *    symlink `~/.claude/skills/<diretório>` → `.agents/skills/<diretório>`, e
 *    o harness descobre a skill pelo `name` do frontmatter. Se os dois
 *    divergirem, a skill aparece na máquina com outro nome do que o
 *    diretório — e o symlink aponta para o nome errado.
 * 5. **FANTASMA** — o inverso: o `AGENTS.md` (ou um agent) cita uma skill que
 *    **não existe** em `.agents/skills/`. É o mesmo par órfão/fantasma que o
 *    `check-agent-routing-coverage` mede para agents.
 *
 * ## O que este gate NÃO mede
 *
 * - **A qualidade do wrapper** — se o `name`/`description` do wrapper batem
 *   com o frontmatter canônico é problema de *drift* entre dois arquivos, e
 *   o `check-doc-claims` (números) não é o lugar. O `find-skills` §5 passo 5
 *   manda copiar literalmente; a verificação disso é **humana** por ora.
 * - **Se o dono é o agent certo** — o gate mede que existe UM dono, não que
 *   seja o melhor. Julgar isso é leitura.
 * - **O conteúdo da skill** — o gate mede registro, não VERBALHO.
 *
 * ## Por que o `AGENTS.md` e não outro índice
 *
 * MEDIDO 2026-11-05: existem três índices candidatos no repo — `AGENTS.md`,
 * o `README.md` e `.agents/specs/conventions/README.md`. O `AGENTS.md` é o
 * único que o `README.md` declara como o índice agent↔skill ("29 skills …
 * (agent↔skill: AGENTS.md §3.2)"), e o único que lista skills **por nome**.
 * Os outros dois ou só contam, ou listam convenções. Escolher um índice
 * diferente seria inventar uma fonte — e o repo tem uma regra explícita
 * contra isso: o fato tem **um** dono (`documentacao.md` §2).
 *
 * ## A citação que o gate exige
 *
 * O `AGENTS.md` cita 20 skills só pelo **nome** (o bloco "Skills de auditoria
 * (1:1)" lista `prisma-audit`, `openapi-audit`, … sem link). Portanto o gate
 * aceita **nome OU link**: exigir link seria reprovar 20 skills que estão
 * registradas do jeito que o próprio índice usa. E o nome é contado com
 * **fronteira de palavra** — `ui-craft` não casa dentro de `ui-craft-x`, e
 * `prisma-audit` não casa dentro de `prisma-audit-extra`. Sem fronteira, o
 * `includes` acusaria uma skill que não existe (classe 5 de
 * `guard-classes.md`: a forma defeituosa não existe no repo).
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { lerFrontmatter as lerBloco, type CampoFrontmatter } from './frontmatter';
import { linhasDoRelato, type CheckResult } from './check-types';

/** Onde vive a skill canônica. */
export const DIR_SKILLS = path.join('.agents', 'skills');

/** Onde vive o índice canônico de skills. */
export const INDICE = 'AGENTS.md';

/** Onde vivem os agents (o dono de uma skill). */
export const DIR_AGENTS = path.join('.agents', 'agents');

/** Onde vivem os workflows (também carregam skill). */
export const DIR_WORKFLOWS = path.join('.agents', 'workflows');

/** Uma lacuna de registro de skill. */
export interface Lacuna {
  /** A skill com a lacuna. */
  skill: string;
  /** Qual regra foi violada. */
  regra: 'indexada' | 'sem-dono' | 'reciproca' | 'descobrivel' | 'fantasma';
  /** Detalhe legível do problema. */
  detalhe: string;
}

/**
 * O frontmatter de uma skill — o que o harness lê para descobrir ela.
 *
 * Só os dois campos que importam para a descoberta: `name` (sob o qual a
 * skill é registrada) e `description` (o texto que o modelo casa com o
 * pedido). Os demais (`version`, `updated`) são convenção do repo.
 */
export interface FrontmatterSkill {
  name: string;
  description: string;
}

/**
 * Lê o frontmatter do `SKILL.md`.
 *
 * O parser é o [`frontmatter.ts`](./frontmatter.ts) — o dono do frontmatter do
 * repo (a camada de agents usa o mesmo). O valor pode vir entre aspas
 * (`"..."`), cru (`texto`) ou dobrado (`>` seguido de linhas indentadas) — as
 * três formas existem no repo, e as duas últimas são as que o `find-skills` §5
 * proíbe, mas uma skill de fora pode vir assim.
 *
 * Duas formas que o parser anterior deixava passar e esta não:
 *
 * - **`description: # TODO`** — o `#` abre um comentário, e o valor do YAML é
 *   **null**. A skill ficava sem **gatilho**: o Claude Code não descobre
 *   quando usá-la. Aqui o valor vazio vira `''`, e a regra DESCOBRÍVEL
 *   acusa.
 * - **frontmatter sem o `---` que fecha** — o bloco não existe. O parser
 *   anterior lia até o fim do arquivo e tratava o **corpo** como frontmatter;
 *   uma skill com `name:` no corpo passava como se tivesse frontmatter.
 */
export function lerFrontmatter(conteudo: string): FrontmatterSkill {
  const bloco = lerBloco(conteudo);

  // Sem `---` que fecha, o arquivo NÃO tem frontmatter — e o corpo não é
  // lido como se tivesse.
  if (!bloco.abre || bloco.fecha === null) return { name: '', description: '' };

  // Última ocorrência vence (o YAML last-wins), e o valor vazio — comentário,
  // `null`, `[]` — vira string vazia.
  const ultimos = new Map<string, CampoFrontmatter>();
  for (const campo of bloco.campos) ultimos.set(campo.campo, campo);

  const nome = ultimos.get('name');
  const descricao = ultimos.get('description');

  return {
    name: nome === undefined || nome.vazio ? '' : nome.texto,
    description: descricao === undefined || descricao.vazio ? '' : descricao.texto,
  };
}

/**
 * As skills canônicas: os diretórios de `.agents/skills/` que têm
 * `SKILL.md`.
 *
 * Um diretório sem `SKILL.md` não é uma skill — é lixo. Contá-lo faria o
 * gate acusar uma skill que ninguém criou.
 */
export async function listarSkills(repoRoot: string): Promise<string[]> {
  const base = path.join(repoRoot, DIR_SKILLS);
  let entradas: import('node:fs').Dirent[];
  try {
    entradas = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }
  const achadas: string[] = [];
  for (const entrada of entradas) {
    if (!entrada.isDirectory()) continue;
    try {
      await fs.access(path.join(base, entrada.name, 'SKILL.md'));
      achadas.push(entrada.name);
    } catch {
      // diretório sem SKILL.md: não é uma skill
    }
  }
  return achadas.sort();
}

/**
 * O texto que o índice e os agents citam.
 *
 * Lê o `AGENTS.md` inteiro e **todos** os `.md` de `.agents/agents/` —
 * inclusive os de subdiretório (o `telemetry-specialist/` tem
 * `instrumentations.md`, `output-schema.md` e `patterns.md`, que citam
 * skills). Um `ls` não bastava: MEDIDO 2026-11-05, `learning-observation` é
 * citada só por um arquivo de subdiretório, e um gate que medisse só o
 * diretório raiz a acusaria como órfã.
 *
 * Devolve também o texto **por agent** (o nome do agent → o conteúdo dos
 * seus arquivos), porque a regra RECÍPROCA precisa do texto do dono
 * declarado — e não da união de todos os citadores.
 */
export async function lerTextosCitadores(
  repoRoot: string,
): Promise<{ indice: string; agents: string; porAgent: Map<string, string> }> {
  const indice = await fs.readFile(path.join(repoRoot, INDICE), 'utf-8').catch(() => '');

  const porAgent = new Map<string, string>();
  let agents = '';
  const base = path.join(repoRoot, DIR_AGENTS);
  const arquivos: string[] = [];
  async function andar(dir: string): Promise<void> {
    let entradas: import('node:fs').Dirent[];
    try {
      entradas = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      const full = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        await andar(full);
      } else if (entrada.name.endsWith('.md')) {
        arquivos.push(full);
      }
    }
  }
  await andar(base);
  for (const arquivo of arquivos.sort()) {
    const texto = await fs.readFile(arquivo, 'utf-8').catch(() => '');
    agents += texto + '\n';
    // O nome do agent é o nome do arquivo `.md` na RAIZ de `.agents/agents/`.
    // Um arquivo em SUBDIRECTÓRIO (`telemetry-specialist/output-schema.md`)
    // pertence ao agent do subdiretório — senão a regra RECÍPROCA
    // reconciliaria contra um agent que não existe ("output-schema").
    const relativo = path.relative(base, arquivo);
    const partes = relativo.split(path.sep);
    const nome = partes.length > 1 ? (partes[0] as string) : path.basename(arquivo, '.md');
    porAgent.set(nome, (porAgent.get(nome) ?? '') + texto + '\n');
  }
  return { indice, agents, porAgent };
}

/**
 * O texto casa o nome como **palavra inteira**.
 *
 * `ui-craft` NÃO casa dentro de `ui-craft-extra`; `prisma-audit` NÃO casa
 * dentro de `prisma-audit-superseded`. Sem a fronteira, um nome que fosse
 * prefixo de outro acusaria uma skill que não existe — a classe 5 de
 * `guard-classes.md`.
 *
 * A fronteira é o lookbehind de `(?<![\\w-])` e o lookahead de
 * `(?![\\w-])`: em JavaScript o `\b` **não** serviria, porque `-` é um
 * caractere de palavra em `\w` só quando precedido de letra — o `\b` entre
 * `t` e `-` de `ui-craft` NÃO é fronteira, e o nome casaria dentro de
 * `ui-craft-extra`.
 */
export function citaNome(texto: string, nome: string): boolean {
  if (nome.length === 0) return false;
  const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${escapado}(?![\\w-])`).test(texto);
}

/**
 * Os nomes de skill que o texto cita.
 *
 * Só considera o padrão de **link** (`.agents/skills/<nome>/SKILL.md`):
 * é o que permite dizer que um nome citado **é uma skill** e não uma
 * palavra qualquer — `prisma-audit` como palavra aparece em prosa que
 * fala do processo, e `.agents/skills/prisma-audit/SKILL.md` é o caminho.
 *
 * A checagem de nome solto (para as skills citadas só pelo nome) é feita
 * por {@link citaNome} contra o índice.
 */
export function nomesCitadosPorLink(texto: string): string[] {
  const achados = new Set<string>();
  const re = /\.agents\/skills\/([a-z0-9][a-z0-9-]*)\/SKILL\.md/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    if (m[1] !== undefined) achados.add(m[1]);
  }
  return [...achados].sort();
}

/**
 * O bloco `**Quem invoca:**` da skill, com o nome do agent que ela declara.
 *
 * O bloco é o cabeçalho `> **Quem invoca:** \`agent\` (…)` — o parágrafo
 * vai até a linha em branco seguinte ou até a próxima linha de citação
 * (`>`). Sem esse corte, o texto pullado seria o resto do arquivo e
 * "Quem invoca" capturaria nomes de agent que não são o dono.
 *
 * Devolve `null` quando a skill não declara o cabeçalho, ou quando declara
 * um nome que não é um agent do repo (aí não há o que reconciliar).
 */
export function donoDeclarado(canonico: string, agentsConhecidos: Set<string>): string | null {
  // `search` e não `match`: o cabeçalho é uma linha de citação que começa
  // com `> `, e `match` ancoraria no início do arquivo — que é o título.
  //
  // O lookahead `(?=\n\n|\n>|$)` corta o bloco no parágrafo seguinte, na
  // próxima linha de citação ou no fim do arquivo. O corte é o que impede
  // que o "Quem invoca" capture nomes de agent citados **depois** (a
  // reconciliação seria feita contra o agent errado).
  const bloco = canonico.match(/\*\*Quem invoca:\*\*\s*(.+?)(?=\n\n|\n>|$)/s);
  if (!bloco || bloco[1] === undefined) return null;
  for (const nome of bloco[1].match(/`([a-z][a-z0-9-]+)`/g) ?? []) {
    const limpo = nome.replace(/`/g, '');
    if (agentsConhecidos.has(limpo)) return limpo;
  }
  return null;
}

/**
 * As lacunas de registro.
 *
 * Separado de {@link checkSkillCoverage} para que o spec possa exercitar a
 * reconciliação sem passar pelo disco — e porque a função é a que o
 * **dente** mede.
 */
export function lacunasDeRegistro(
  skills: string[],
  indice: string,
  citadores: string,
  frontmatters: Map<string, FrontmatterSkill>,
  canonicos?: Map<string, string>,
  agentsConhecidos?: Set<string>,
  textosPorAgent?: Map<string, string>,
): Lacuna[] {
  const lacunas: Lacuna[] = [];
  const canonicoMap = canonicos ?? new Map<string, string>();
  const conhecidos = agentsConhecidos ?? new Set<string>();
  const porAgent = textosPorAgent ?? new Map<string, string>();

  for (const skill of skills) {
    // (1) INDEXADA — citada no AGENTS.md, por nome ou por link.
    if (!citaNome(indice, skill) && !nomesCitadosPorLink(indice).includes(skill)) {
      lacunas.push({
        skill,
        regra: 'indexada',
        detalhe:
          `a skill existe em ${DIR_SKILLS}/${skill}/SKILL.md mas não é citada no ` +
          `${INDICE} (o índice canônico de skills) — quem lê o índice não a descobre`,
      });
    }

    // (2) SEM DONO — citada por nenhum agent, workflow ou outra skill.
    if (!citaNome(citadores, skill)) {
      lacunas.push({
        skill,
        regra: 'sem-dono',
        detalhe:
          `nenhuma agent, workflow ou skill em ${DIR_AGENTS}/, ${DIR_WORKFLOWS}/ ` +
          'ou entre as próprias skills cita esta — o `find-skills` §5 passo 4 diz ' +
          'que "a skill sem agent que a carregue é órfã", e uma skill órfã é ' +
          'executada por ninguém',
      });
    }

    // (3) RECÍPROCA — a skill declara um dono que não a cita de volta.
    //
    // A checagem é contra o texto do **dono declarado**, e não contra a
    // união de todos os citadores: se outro agent cita a skill, o dono
    // declarado continua sem saber que ela existe — que é exatamente o
    // drift que a regra existe para pegar.
    const canonico = canonicoMap.get(skill);
    if (canonico !== undefined) {
      const dono = donoDeclarado(canonico, conhecidos);
      if (dono !== null) {
        const textoDoDono = porAgent.get(dono) ?? '';
        if (!citaNome(textoDoDono, skill)) {
          lacunas.push({
            skill,
            regra: 'reciproca',
            detalhe:
              `a skill declara "Quem invoca: \`${dono}\`" mas esse agent não a ` +
              'cita — a skill aponta para um dono que não sabe que ela existe, ' +
              'e a descoberta nunca acontece',
          });
        }
      }
    }

    // (4) DESCOBRÍVEL — o frontmatter que o harness lê para achar a skill.
    //
    // O `SKILL.md` canônico É o arquivo que o harness abre (medido em
    // 2026-11-09: com `.claude` como symlink para `.agents`, as 30 skills e os
    // 28 agents foram descobertos sem wrapper nenhum). O que decide a
    // descoberta é o `name` e a `description` do frontmatter — e o `name`
    // precisa concordar com o diretório, porque o binding do Claude Code é o
    // symlink `~/.claude/skills/<diretório>`.
    //
    // A ausência da entrada no mapa é tratada como **defeito**, não como
    // "não medido": sem frontmatter legível, a skill não é descobrível por
    // nenhum harness — e um gate que passa por não ter medido é a classe 5
    // de `guard-classes.md`.
    const fm = frontmatters.get(skill);
    if (fm === undefined) {
      lacunas.push({
        skill,
        regra: 'descobrivel',
        detalhe:
          `o frontmatter de ${DIR_SKILLS}/${skill}/SKILL.md não pôde ser lido — ` +
          'sem `name` e `description` a skill não é descobrível por nenhum ' +
          'harness, e o Claude Code a abre por esse arquivo',
      });
    } else if (fm.name.trim() === '' || fm.description.trim() === '') {
      lacunas.push({
        skill,
        regra: 'descobrivel',
        detalhe:
          `o frontmatter de ${DIR_SKILLS}/${skill}/SKILL.md não tem ` +
          `\`name\` e \`description\` preenchidos — o harness descobre a skill ` +
          'pelo `name` e decide se ela casa com o pedido pelo `description`; ' +
          'sem os dois, ela é invisível',
      });
    } else if (fm.name.trim() !== skill) {
      lacunas.push({
        skill,
        regra: 'descobrivel',
        detalhe:
          `o \`name\` do frontmatter de ${DIR_SKILLS}/${skill}/SKILL.md é ` +
          `"${fm.name.trim()}" e não "${skill}" — o binding do Claude Code é o ` +
          `symlink \`~/.claude/skills/<diretório>\` → \`${DIR_SKILLS}/<diretório>\`, ` +
          'e o harness registra a skill pelo `name`: com os dois diferentes, ela ' +
          'aparece na máquina com outro nome do que o diretório',
      });
    }
  }

  // (5) FANTASMA — o inverso: citado, mas não existe.
  //
  // O alcance é o índice **e** os citadores (agents, workflows e as outras
  // skills): um link para uma skill inexistente é quebrado em qualquer um
  // deles, e a mensagem diz **onde** foi encontrado — senão quem lê tem que
  // caçar o arquivo.
  for (const [origem, texto] of [
    [INDICE, indice],
    ['agents/workflows/skills', citadores],
  ] as const) {
    for (const citado of nomesCitadosPorLink(texto)) {
      if (!skills.includes(citado)) {
        lacunas.push({
          skill: citado,
          regra: 'fantasma',
          detalhe:
            `${origem} aponta para ${DIR_SKILLS}/${citado}/SKILL.md, que não ` +
            'existe no disco — link quebrado que aponta para uma skill que ninguém ' +
            'escreveu',
        });
      }
    }
  }

  // A ordem das mensagens é estável (alfabética por skill, e por regra
  // dentro da skill): duas execuções do gate produzem a mesma saída, e uma
  // mensagem que reordena não é diffável.
  const ordem: Record<Lacuna['regra'], number> = {
    indexada: 0,
    'sem-dono': 1,
    reciproca: 2,
    descobrivel: 3,
    fantasma: 4,
  };
  return lacunas.sort((a, b) => a.skill.localeCompare(b.skill) || ordem[a.regra] - ordem[b.regra]);
}

/** Lê todos os `.md` de um diretório, recursivamente. */
async function lerMarkdown(dir: string): Promise<string[]> {
  const textos: string[] = [];
  async function andar(atual: string): Promise<void> {
    let entradas: import('node:fs').Dirent[];
    try {
      entradas = await fs.readdir(atual, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      const full = path.join(atual, entrada.name);
      if (entrada.isDirectory()) {
        await andar(full);
      } else if (entrada.name.endsWith('.md')) {
        textos.push(await fs.readFile(full, 'utf-8').catch(() => ''));
      }
    }
  }
  await andar(dir);
  return textos;
}

export async function checkSkillCoverage(opts: { repoRoot: string }): Promise<CheckResult> {
  const root = path.resolve(opts.repoRoot);

  const skills = await listarSkills(root);
  if (skills.length === 0) {
    // Anti-vacuuidade: sem skills, o gate não mediu nada. Verde por
    // ausência é a classe 5 de `guard-classes.md`.
    return {
      ok: false,
      errors: [
        `nenhuma skill encontrada em ${DIR_SKILLS}/ — o gate não tem o que medir ` +
          '(o diretório existe?). Um gate que passa sem corpus é teatro.',
      ],
    };
  }

  const { indice, agents, porAgent } = await lerTextosCitadores(root);

  // Os citadores: agents + workflows + as outras skills. A regra de
  // alcançabilidade mede o alcance real (ver o cabeçalho).
  const workflows = await lerMarkdown(path.join(root, DIR_WORKFLOWS));
  const canonicos = new Map<string, string>();
  for (const skill of skills) {
    const texto = await fs
      .readFile(path.join(root, DIR_SKILLS, skill, 'SKILL.md'), 'utf-8')
      .catch(() => '');
    canonicos.set(skill, texto);
  }
  const citadores = [agents, ...workflows, ...[...canonicos.values()]].join('\n');

  // Os agents que o repo conhece (para reconciliar o "Quem invoca").
  const agentsConhecidos = new Set<string>();
  try {
    for (const entrada of await fs.readdir(path.join(root, DIR_AGENTS), {
      withFileTypes: true,
    })) {
      if (entrada.isFile() && entrada.name.endsWith('.md')) {
        agentsConhecidos.add(entrada.name.replace(/\.md$/, ''));
      }
    }
  } catch {
    // sem diretório de agents: nenhum dono é conhecido, e a regra recíproca
    // não acusa — o gate não tem como saber quem é o dono.
  }

  // O frontmatter de cada skill — o que o harness lê para descobri-la.
  // Lido do MESMO arquivo que o resto do gate lê, para que a regra e a
  // reconciliação não possam discordar sobre o que existe.
  const frontmatters = new Map<string, FrontmatterSkill>();
  for (const skill of skills) {
    frontmatters.set(skill, lerFrontmatter(canonicos.get(skill) ?? ''));
  }

  const lacunas = lacunasDeRegistro(
    skills,
    indice,
    citadores,
    frontmatters,
    canonicos,
    agentsConhecidos,
    porAgent,
  );

  const errors = lacunas.map((l) => {
    if (l.regra === 'fantasma') {
      return `skill fantasma: ${l.detalhe}`;
    }
    return `lacuna de registro [${l.regra}] ${l.skill}: ${l.detalhe}`;
  });

  return { ok: errors.length === 0, errors };
}

// Executado como CLI.
//
// `checkSkillCoverage` é **assíncrono**, então o bloco usa `.then()` — o
// mesmo padrão de `check-ci-local-e2e.ts`. Um `const r = checkSkillCoverage(...)`
// sem `await` daria `r.ok === undefined` e sairia **1** sempre.
if (process.argv[1]?.endsWith('check-skill-coverage.ts')) {
  checkSkillCoverage({ repoRoot: '.' }).then((r) => {
    for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
    process.exit(r.ok ? 0 : 1);
  });
}
