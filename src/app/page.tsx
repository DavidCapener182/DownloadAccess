import { LiveMonitorDashboard } from "@/components/live-monitor-dashboard";
import { sanitizeDashboardSnapshot } from "@/lib/privacy";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snapshot = await getStore().listDashboard();
  return <LiveMonitorDashboard initialSnapshot={sanitizeDashboardSnapshot(snapshot)} />;
}
