import { notFound } from "next/navigation";
import AdminDashboardClient from "@/app/admin/admin-dashboard-client";
import { normalizeUsageRows } from "@/app/admin/usage-normalizers";
import { isLocalAdminEnabled } from "@/lib/local-admin";
import { getLocalUsageLogs } from "@/lib/local-usage-logs";
import { listPersistedUsageLogs } from "@/lib/persisted-usage-logs";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isLocalAdminEnabled()) {
    notFound();
  }

  const [localLogs, persistedLogs] = await Promise.all([
    Promise.resolve(getLocalUsageLogs()),
    listPersistedUsageLogs(500),
  ]);
  const rows = normalizeUsageRows({ localLogs, persistedLogs });

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <AdminDashboardClient rows={rows} />
      </div>
    </main>
  );
}
