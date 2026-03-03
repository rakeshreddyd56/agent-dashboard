export async function register() {
  // Only run on server
  if (typeof window !== 'undefined') return;

  const handleShutdown = (signal: string) => {
    console.log(`\n[shutdown] Received ${signal}, cleaning up...`);

    try {
      // Close file watchers
      import('@/lib/coordination/file-watcher').then(({ fileWatcher }) => {
        fileWatcher.stopAll?.();
      }).catch(() => {});
    } catch {}

    // Give a moment for cleanup, then exit
    setTimeout(() => {
      console.log('[shutdown] Goodbye.');
      process.exit(0);
    }, 500);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}
