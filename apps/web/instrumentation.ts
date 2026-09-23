// apps/web/instrumentation.ts (Next.js 13+ convention file)
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./instrumentation.edge');
  }
}
