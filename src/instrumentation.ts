export async function register() {
  if (typeof window !== 'undefined') return;
  if (process.env.NEXT_RUNTIME === 'edge') return;

  // Dynamic import keeps all Node.js APIs out of Edge bundle analysis
  const { setupShutdownHandlers } = await import('@/lib/server-shutdown');
  setupShutdownHandlers();
}
