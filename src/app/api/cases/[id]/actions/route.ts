import { HttpError, errorResponse, jsonResponse, readJson } from "@/lib/http";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const payload = await readJson<Record<string, unknown>>(request);
    const note =
      typeof payload.note === "string" && payload.note.trim().length > 2
        ? payload.note.trim()
        : null;

    if (!note) {
      throw new HttpError(400, "Action note must contain at least 3 characters.");
    }

    const action = await getStore().addCaseAction(
      id,
      typeof payload.action_type === "string"
        ? payload.action_type
        : "Action taken",
      note,
      null,
    );

    return jsonResponse({ action }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
