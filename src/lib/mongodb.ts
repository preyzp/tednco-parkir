import "server-only";

import { MongoClient, type Db } from "mongodb";

import { getServerEnv } from "./env";

type Connection = { client: MongoClient; dbName: string };
type ConnectionCache = { promise?: Promise<Connection> };

const developmentGlobal = globalThis as typeof globalThis & {
  tedncoMongoDB?: ConnectionCache;
};

// Development HMR shares the cache; production owns one cache per module/process.
const cache: ConnectionCache = process.env.NODE_ENV === "development"
  ? (developmentGlobal.tedncoMongoDB ??= {})
  : {};

function getConnection(): Promise<Connection> {
  if (!cache.promise) {
    // Defer work until after the promise is cached, including synchronous errors.
    cache.promise = Promise.resolve().then(async () => {
      try {
        const { MONGODB_URI, MONGODB_DB_NAME } = getServerEnv();
        let client: MongoClient | undefined;
        try {
          client = new MongoClient(MONGODB_URI, {
            serverSelectionTimeoutMS: 10_000,
          });
          await client.connect();
          return { client, dbName: MONGODB_DB_NAME };
        } catch {
          // Failed clients must not leave pools behind. Never surface driver
          // errors (including cleanup errors), which may contain credentials.
          await client?.close().catch(() => {});
          throw new Error("Unable to connect to MongoDB. Check server database configuration and availability.");
        }
      } catch (error) {
        cache.promise = undefined;
        throw error;
      }
    });
  }

  return cache.promise;
}

// Call only in Node.js server runtime code. Do not close the shared client per
// request. Successful configuration is fixed until the process is restarted.
export async function getMongoClient(): Promise<MongoClient> {
  return (await getConnection()).client;
}

export async function getDb(): Promise<Db> {
  const { client, dbName } = await getConnection();
  return client.db(dbName);
}
