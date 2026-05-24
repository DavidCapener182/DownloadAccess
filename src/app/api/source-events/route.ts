import { errorResponse, getBearerToken, jsonResponse, readJson } from "@/lib/http";
import { ingestSourceEvent } from "@/lib/ingestion";
import { sanitizeIngestionResult } from "@/lib/privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return jsonResponse({ ok: true });
}

export async function POST(request: Request) {
  try {
    const payload = await readJson<Record<string, unknown>>(request);
    const result = await ingestSourceEvent(payload, getBearerToken(request));
    return jsonResponse(sanitizeIngestionResult(result), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
