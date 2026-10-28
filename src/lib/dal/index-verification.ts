import "server-only";
import { MongoServerError, type Db } from "mongodb";
import { AppError } from "../errors";
import { logOperationalError, type OperationalDetails } from "../log";

// Read-only check that a required unique partial index exists (never creates
// or changes one). Repositories fail closed ("not_ready") only when the index
// is provably missing; a failed check (network, TLS, timeout, no primary) is
// not proof of anything and becomes SERVICE_UNAVAILABLE instead.
export interface UniquePartialIndex {
  readonly key: Readonly<Record<string, number>>;
  readonly partialFilterExpression: Readonly<Record<string, unknown>>;
}
// NamespaceNotFound: the collection, and so the index, does not exist yet.
const namespaceNotFound = 26;

export async function hasUniquePartialIndex(db: Db, collection: NonNullable<OperationalDetails["collection"]>, index: UniquePartialIndex): Promise<boolean> {
  let indexes: Record<string, unknown>[];
  try {
    indexes = await db.collection(collection).listIndexes().toArray();
  } catch (error) {
    if (error instanceof MongoServerError && error.code === namespaceNotFound) return false;
    logOperationalError("index.verify", error, { outcome: "unavailable", phase: "index", collection });
    throw new AppError("SERVICE_UNAVAILABLE");
  }
  return indexes.some((row) => row.unique === true && !row.sparse && !row.collation
    && JSON.stringify(row.key) === JSON.stringify(index.key)
    && JSON.stringify(row.partialFilterExpression) === JSON.stringify(index.partialFilterExpression));
}
