function createStyleProfileClient({
  fetchImpl = globalThis.fetch,
  baseUrl,
} = {}) {
  return {
    async get(authorization) {
      const url = new URL(
        "/me/style-profile",
        baseUrl ||
          process.env.AUTH_SERVICE_INTERNAL_URL ||
          process.env.AUTH_SERVICE_URL ||
          "http://auth-service:3001",
      );
      const response = await fetchImpl(url, {
        headers: { authorization },
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok)
        throw new Error(`Style profile unavailable (${response.status})`);
      const profile = await response.json();
      if (
        !profile ||
        !Array.isArray(profile.categories) ||
        !Array.isArray(profile.styles) ||
        !Array.isArray(profile.brands) ||
        !Array.isArray(profile.sizes)
      ) {
        throw new Error("Invalid style profile response");
      }
      return profile;
    },
  };
}

module.exports = createStyleProfileClient();
module.exports.createStyleProfileClient = createStyleProfileClient;
