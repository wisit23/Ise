const { customerServiceRuntime } = require("./customerServiceConfig");

async function serializableTransaction(
  client,
  work,
  {
    retryCodes = ["P2034"],
    attempts = customerServiceRuntime.transactionAttempts,
  } = {},
) {
  if (!Number.isSafeInteger(attempts) || attempts <= 0)
    throw new RangeError("Invalid transaction attempts");
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.$transaction(work, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (attempt >= attempts || !retryCodes.includes(error.code)) throw error;
    }
  }
}

module.exports = { serializableTransaction };
