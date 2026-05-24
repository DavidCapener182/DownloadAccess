import { errorResponse, jsonResponse, readJson } from "@/lib/http";
import { reviewSourceEvent } from "@/lib/ingestion";
import { sanitizeIngestionResult } from "@/lib/privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const payload = await readJson<Record<string, unknown>>(request);
    const result = await reviewSourceEvent(id, payload);
    return jsonResponse(sanitizeIngestionResult(result));
  } catch (error) {
    return errorResponse(error);
  }
}
