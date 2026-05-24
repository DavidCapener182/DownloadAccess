import { errorResponse, jsonResponse, readJson } from "@/lib/http";
import { createCaseFromPublicReport } from "@/lib/ingestion";
import { sanitizeIngestionResult } from "@/lib/privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await readJson<Record<string, unknown>>(request);
    const result = await createCaseFromPublicReport(payload);
    return jsonResponse(sanitizeIngestionResult(result), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
