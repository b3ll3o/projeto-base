// tooling/scripts/flow-ir-to-mermaid.spec.ts
//
// pt-BR: Testes do conversor IR archify -> Mermaid. A IR (`docs/flows/**/*.json`)
// e uma IR DE LAYOUT: messages, segments e activations carregam coordenada `y`
// em pixel. O conversor tem que IGNORAR o `y` como posicao e re-derivar a
// ordem semantica dele — e por isso cada teste fixa a ordem ou o agrupamento,
// nao a coordenada.
//
// MEDIDO 2026-10-15 sobre as 15 IRs `sequence`: segments sao faixas de y
// disjuntas que particionam as mensagens; nenhum endpoint de message fica
// fora de participants; todo id de participant casa `[A-Za-z0-9_]`; nao ha
// `#` nem `;` em label (que sao os entity-codes do mermaid), ha 1 aspas dupla
// e 8 sinais de menor.

import { describe, expect, it } from 'vitest';

import {
  escapeMermaidText,
  renderFlowDoc,
  sequenceToMermaid,
  type SequenceIr,
} from './flow-ir-to-mermaid.js';

const ir = (over: Partial<SequenceIr> = {}): SequenceIr => ({
  schema_version: 1,
  diagram_type: 'sequence',
  meta: {
    title: 'Health Check',
    subtitle: 'liveness do apps/api',
    views: [],
  },
  participants: [
    { id: 'client', label: 'Cliente', sublabel: 'curl /health', type: 'external' },
    { id: 'fastify', label: 'Fastify', type: 'backend' },
  ],
  segments: [],
  // Deliberadamente fora de ordem: o conversor tem que ordenar por `y`.
  messages: [
    { from: 'fastify', to: 'client', label: '200 OK', variant: 'return', y: 300 },
    { from: 'client', to: 'fastify', label: 'GET /health', variant: 'default', y: 100 },
  ],
  activations: [],
  cards: [],
  ...over,
});

describe('sequenceToMermaid', () => {
  it('declara participantes na ordem da IR (esquerda -> direita)', () => {
    const out = sequenceToMermaid(ir());
    const linhas = out.split('\n').filter((l) => l.trim().startsWith('participant '));
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toContain('client as Cliente');
    // sublabel vira quebra de linha, nao vaza pro texto
    expect(linhas[0]).toContain('<br/>curl /health');
  });

  it('ordena messages por y, ignorando a ordem do array', () => {
    const out = sequenceToMermaid(ir());
    const req = out.indexOf('GET /health');
    const res = out.indexOf('200 OK');
    expect(req).toBeGreaterThan(-1);
    expect(res).toBeGreaterThan(req);
  });

  it('usa seta pontilhada no variant return e solida nos demais', () => {
    const out = sequenceToMermaid(ir());
    expect(out).toContain('client->>fastify: GET /health');
    expect(out).toContain('fastify-->>client: 200 OK');
  });

  it('agrupa em rect as mensagens dentro da faixa y do segment', () => {
    const out = sequenceToMermaid(ir({ segments: [{ from: 50, to: 150, label: 'Request' }] }));
    expect(out).toMatch(/rect[^\n]*\n[\s\S]*GET \/health[\s\S]*end/);
    // a mensagem de resposta esta ACIMA do segment: fica fora do rect
    const rect = out.slice(out.indexOf('rect'), out.indexOf('\n    end'));
    expect(rect).toContain('GET /health');
    expect(rect).not.toContain('200 OK');
  });

  it('emite activate/deactivate nos limites y da activation', () => {
    const out = sequenceToMermaid(
      ir({ activations: [{ participant: 'fastify', from: 80, to: 320 }] }),
    );
    const act = out.indexOf('activate fastify');
    const msg = out.indexOf('GET /health');
    const deact = out.indexOf('deactivate fastify');
    expect(act).toBeGreaterThan(-1);
    expect(msg).toBeGreaterThan(act);
    expect(deact).toBeGreaterThan(msg);
  });

  it('abre cada activation UMA vez, mesmo depois de fechar', () => {
    // Regressao: o fechamento zerava `aberta` e a mensagem seguinte ainda
    // satisfazia `y >= from`, entao a mesma activation reabria a cada
    // mensagem. MEDIDO no health-check: 9 activations -> 50 `activate`.
    const acts = [
      { participant: 'fastify', from: 80, to: 120 },
      { participant: 'fastify', from: 200, to: 320 },
      { participant: 'client', from: 90, to: 400 },
    ];
    const out = sequenceToMermaid(
      ir({
        activations: acts,
        messages: [
          { from: 'client', to: 'fastify', label: 'a', y: 100 },
          { from: 'fastify', to: 'client', label: 'b', variant: 'return', y: 150 },
          { from: 'client', to: 'fastify', label: 'c', y: 220 },
          { from: 'fastify', to: 'client', label: 'd', variant: 'return', y: 280 },
          { from: 'client', to: 'fastify', label: 'e', y: 340 },
        ],
      }),
    );
    expect(out.match(/^ {4}activate /gm)).toHaveLength(acts.length);
    expect(out.match(/^ {4}deactivate /gm)).toHaveLength(acts.length);
  });

  it('transforma cards em Note sobre todos os participantes', () => {
    const out = sequenceToMermaid(
      ir({ cards: [{ title: 'Sem mocks', items: ['dominio puro', 'sem I/O'] }] }),
    );
    expect(out).toContain('Note over client,fastify:');
    expect(out).toContain('Sem mocks');
    expect(out).toContain('dominio puro');
  });

  it('preserva os views no markdown, porque mermaid nao tem troca de view', () => {
    // Quem carrega os views e `renderFlowDoc`, nao `sequenceToMermaid`: o bloco
    // mermaid tem UM diagrama e nao comporta alternancia. Afirmar sobre a
    // funcao errada daria vermelho falso com a resposta certa em outro lugar.
    const doc = renderFlowDoc(
      ir({
        meta: {
          title: 'T',
          subtitle: '',
          views: [
            { id: 'happy', label: 'DB up', focus: ['client'], note: '200' },
            { id: 'down', label: 'DB down', focus: ['client'], note: '503' },
          ],
        },
      }),
      'docs/flows/x/y.sequence.json',
    );
    // conteudo nao pode sumir
    expect(doc).toContain('happy');
    expect(doc).toContain('DB down');
    expect(doc).toContain('503');
    // ...e o diagrama continua sendo um so
    expect(doc.match(/```mermaid/g)).toHaveLength(1);
  });
});

describe('escapeMermaidText', () => {
  it('so escapa < quando ele iniciaria tag; <= fica literal', () => {
    expect(escapeMermaidText('a < b')).toBe('a < b');
    expect(escapeMermaidText('<br>')).toContain('&lt;br&gt;');
  });

  it('escapa aspas duplas', () => {
    expect(escapeMermaidText('diz "oi"')).not.toContain('"');
  });

  it('converte quebra de linha em <br/>', () => {
    expect(escapeMermaidText('a\nb')).toBe('a<br/>b');
  });
});
