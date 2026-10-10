const clientDefaults = require("./customer-service-client.json");

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${name} must be a positive integer`);
}

function validateClientConfig(config) {
  for (const section of ["pagination", "timing"])
    for (const key of Object.keys(clientDefaults[section]))
      positiveInteger(config[section]?.[key], `${section}.${key}`);
  const dashboard = config.dashboard;
  positiveInteger(dashboard?.pageSize, "dashboard.pageSize");
  positiveInteger(dashboard?.previewLimit, "dashboard.previewLimit");
  positiveInteger(dashboard?.warningMinutes, "dashboard.warningMinutes");
  new Intl.DateTimeFormat("en", { timeZone: dashboard.timeZone });
  if (
    !Array.isArray(dashboard.dayRanges) ||
    !dashboard.dayRanges.includes(dashboard.defaultDays)
  )
    throw new RangeError("Invalid dashboard day ranges");
  dashboard.dayRanges.forEach((days) =>
    positiveInteger(days, "dashboard.days"),
  );
  if (
    !Array.isArray(dashboard.agingHours) ||
    dashboard.agingHours.length !== 2 ||
    dashboard.agingHours[0] >= dashboard.agingHours[1]
  )
    throw new RangeError("Invalid dashboard aging hours");
  dashboard.agingHours.forEach((hours) =>
    positiveInteger(hours, "dashboard.agingHours"),
  );
  for (const name of ["chat", "evidence"]) {
    positiveInteger(config[name]?.maxFileBytes, `${name}.maxFileBytes`);
    if (
      !Array.isArray(config[name].mimeTypes) ||
      !config[name].mimeTypes.length ||
      config[name].mimeTypes.some(
        (type) => typeof type !== "string" || !type.includes("/"),
      )
    )
      throw new RangeError(`Invalid ${name} MIME types`);
  }
  positiveInteger(config.chat.maxMessageLength, "chat.maxMessageLength");
  positiveInteger(config.evidence.maxFiles, "evidence.maxFiles");
  for (const key of Object.keys(clientDefaults.rateLimits)) {
    positiveInteger(config.rateLimits?.[key]?.limit, `rateLimits.${key}.limit`);
    positiveInteger(
      config.rateLimits[key].windowSeconds,
      `rateLimits.${key}.windowSeconds`,
    );
  }
  return config;
}

module.exports = { positiveInteger, validateClientConfig };
