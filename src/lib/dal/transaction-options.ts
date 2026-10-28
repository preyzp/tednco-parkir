import "server-only";

// Shared options for the parking and settings write transactions.
// timeoutMS bounds one whole withTransaction (callback attempts + commit
// retries) and replaces the driver's 120 s retry window. On expiry the driver
// aborts the transaction itself and throws MongoOperationTimeoutError; a
// timeout during commit leaves the outcome unknown, so callers report "unknown".
export const transactionTimeoutMS = 20_000;
export const transactionOptions = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary", timeoutMS: transactionTimeoutMS } as const;
