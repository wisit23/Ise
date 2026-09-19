const handler = {
  get(target, prop) {
    if (prop === "then") return undefined;
    if (prop === "$queryRaw") return async () => [];
    if (prop === "$transaction") return async (fn) => typeof fn === "function" ? fn(proxy) : Promise.all(fn);
    return proxy;
  },
  apply() {
    return proxy;
  },
};
const proxy = new Proxy(() => {}, handler);

module.exports = proxy;
