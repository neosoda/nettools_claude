export async function callBackend<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    const msg = e?.message ?? 'Erreur serveur inconnue';
    console.error(msg);
    // Re‑throw to allow further handling upstream if required
    throw e;
  }
}
