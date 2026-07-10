const MIN_SPACING_MS = 100;

let lastCallAt = 0;
let chain: Promise<unknown> = Promise.resolve();

/**
 * Scryfall asks clients to keep requests to roughly 10/sec and to prefer
 * caching over repeated calls. This serializes all outbound calls with a
 * minimum spacing so the whole process (not just one request) respects that.
 */
export function enqueueScryfallCall<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_SPACING_MS - Date.now());
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastCallAt = Date.now();
    return fn();
  });

  // Keep the chain alive even if this call fails, so later calls aren't stuck.
  chain = result.catch(() => undefined);

  return result;
}
