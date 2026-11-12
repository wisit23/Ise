// Standby HTTP replicas must not run the candidate release's business jobs.
function backgroundWorkersEnabled(env = process.env) {
  const value = env.BACKGROUND_WORKERS_ENABLED ?? "true";
  if (value !== "true" && value !== "false") {
    throw new Error("BACKGROUND_WORKERS_ENABLED must be true or false");
  }
  return value === "true";
}

function startBackgroundWorkers(start, env = process.env) {
  const enabled = backgroundWorkersEnabled(env);
  console.info(`[background-workers] ${enabled ? "enabled" : "disabled"}`);
  if (enabled) start();
  return enabled;
}

module.exports = { backgroundWorkersEnabled, startBackgroundWorkers };
