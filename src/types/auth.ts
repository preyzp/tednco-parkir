import type { ObjectId } from "mongodb";
import type { Account, Session, Verification, RateLimit } from "better-auth/types";

// BSON projections of library models, not a second identity/session system.
export type AuthAccount = Omit<Account, "id" | "userId"> & { _id: ObjectId; userId: ObjectId };
export type AuthSession = Omit<Session, "id" | "userId"> & { _id: ObjectId; userId: ObjectId };
export type AuthVerification = Omit<Verification, "id"> & { _id: ObjectId };
export type AuthRateLimit = Omit<RateLimit, "id"> & { _id: ObjectId };
