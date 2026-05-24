import { errorResponse, jsonResponse, readJson } from "@/lib/http";
import { updateCaseFromPayload } from "@/lib/ingestion";
import { sanitizeCase } from "@/lib/privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const payload = await readJson<Record<string, unknown>>(request);
    const updated = await updateCaseFromPayload(id, payload);
    return jsonResponse({ case: sanitizeCase(updated) });
  } catch (error) {
    return errorResponse(error);
  }
}
