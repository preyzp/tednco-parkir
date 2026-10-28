// @ts-check
import { MongoClient } from "mongodb";
import { applyParkingIndexes, parkingIndexPlan, validateParkingIndexSetup } from "./parking-indexes-core.mjs";

// Explicit maintenance CLI only (never run by the app). Default: offline dry-run.
async function main() {
  if (process.argv.slice(2).length === 1 && process.argv[2] === "--help") {
    console.log("Development-only parking index setup. Default: offline --dry-run. --apply requires TEDNCO_DEV_WRITE_CONFIRMATION=CREATE_PARKING_INDEXES. Create-only; never drops or writes documents.");
    return;
  }
  const input = validateParkingIndexSetup(process.env, process.argv.slice(2));
  if (!input.apply) {
    console.log(`DRY RUN (offline) for ${input.database}. No connection or writes. Planned create-only indexes:`);
    for (const [collection, plan] of Object.entries(parkingIndexPlan)) for (const index of plan) console.log(`- ${collection}.${index.name} ${JSON.stringify(index.key)}${index.unique ? " unique" : ""}${"partialFilterExpression" in index ? " partial " + JSON.stringify(index.partialFilterExpression) : ""}`);
    return;
  }
  const client = new MongoClient(process.env.MONGODB_URI ?? "", { serverSelectionTimeoutMS: 10000, retryWrites: false });
  try {
    await client.connect();
    for (const line of await applyParkingIndexes(client, input)) console.log(line);
    console.log("Parking index setup verified.");
  } finally { await client.close(); }
}
main().catch(() => {
  console.error("Parking index setup was not completed. Review existing indexes securely; nothing was dropped. Connection details are suppressed.");
  process.exitCode = 1;
});
