# apps/web — Home Page SSR Render

> Browser → Next.js (RSC) → HomePage component → HTML stream

> Diagrama derivado da IR `docs/flows/web-app/web-app-flow-01/web-app-flow-01.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant browser as Browser<br/>client
    participant next as Next.js<br/>App Router
    participant rsc_home as HomePage<br/>app/page.tsx
    participant html_stream as HTML stream<br/>RSC payload
    rect Request
    activate next
    browser->>next: GET / (page request)
    activate rsc_home
    next->>rsc_home: render HomePage()
    rsc_home->>next: JSX → RSC tree
    next->>rsc_home: inline critical CSS
    end
    rect Render
    rsc_home->>next: static JSX (no data)
    deactivate rsc_home
    activate html_stream
    next->>html_stream: serialize stream
    end
    html_stream-->>next: RSC chunks
    deactivate html_stream
    rect Response
    next->>browser: HTML + RSC payload
    deactivate next
    end
    Note over browser,html_stream: HomePage RSC puro<br/>app/page.tsx é async function component (Server Component)<br/>Sem fetch — renderiza JSX estático com Tailwind 4 utilities<br/>Next.js 15 App Router streaming: chunks chegam progressivamente<br/>Bundle mínimo para home (sem data fetching)
    Note over browser,html_stream: Static + RSC streaming<br/>JSX puro → renderizado server-side para HTML estático<br/>RSC payload inline: tree de componentes para client hydration<br/>streaming SSR: chunks iniciam transferência assim que renderizam<br/>WebVitalsReporter captura LCP no client via web-vitals → OTel
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `ssr-home` | Home SSR | `browser`, `next`, `rsc_home`, `html_stream` | HomePage é RSC puro (sem data fetch) — Server Component renderiza JSX para HTML stream. |
