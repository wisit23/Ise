function createUpstreamChecks(services) {
  return ["auth", "products", "orders", "chat", "support"].map(
    (name) => async () => {
      const response = await fetch(new URL("/ready", services[name]), {
        signal: AbortSignal.timeout(1500),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`${name} is not ready`);
    },
  );
}

module.exports = { createUpstreamChecks };
