/** Runs once per server process start. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startAlgorithm } = await import('./lib/server/algorithm');
  startAlgorithm();
}
