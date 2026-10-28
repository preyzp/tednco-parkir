import { checkDatabaseHealth, healthTokenMatches } from "../../../lib/health";

// GET /api/health
// - No x-health-token header: liveness only, {"status":"ok"}; no database access.
// - x-health-token matching HEALTHCHECK_TOKEN: one bounded, cached MongoDB ping;
//   200 healthy / 503 unhealthy with a coarse category only.
// - Wrong token, or HEALTHCHECK_TOKEN not configured: 401 with no health data
//   (both look the same, so the configuration cannot be probed).
// Reading request headers keeps this handler dynamic under Cache Components.
const noStore = { "cache-control": "no-store", pragma: "no-cache" };

export async function GET(request: Request): Promise<Response> {
  const token = request.headers.get("x-health-token");
  if (token === null) return Response.json({ status: "ok" }, { headers: noStore });
  if (!healthTokenMatches(token)) return Response.json({ status: "unauthorized" }, { status: 401, headers: noStore });
  const health = await checkDatabaseHealth();
  return Response.json(
    { status: health.healthy ? "healthy" : "unhealthy", database: health.database },
    { status: health.healthy ? 200 : 503, headers: noStore },
  );
}
