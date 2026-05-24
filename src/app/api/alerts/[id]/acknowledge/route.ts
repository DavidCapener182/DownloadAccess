import { HttpError, errorResponse, jsonResponse } from "@/lib/http";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const alert = await getStore().acknowledgeAlert(id, null);
    if (!alert) {
      throw new HttpError(404, "Alert not found.");
    }

    return jsonResponse({ alert });
  } catch (error) {
    return errorResponse(error);
  }
}
