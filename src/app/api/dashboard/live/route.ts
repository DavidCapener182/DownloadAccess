import { errorResponse, jsonResponse } from "@/lib/http";
import { sanitizeDashboardSnapshot } from "@/lib/privacy";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getStore().listDashboard();
    return jsonResponse(sanitizeDashboardSnapshot(snapshot));
  } catch (error) {
    return errorResponse(error);
  }
}
