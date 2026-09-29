import { redirect } from "next/navigation";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { loadDashboardData } from "@/lib/dashboard/load-dashboard";

export default async function DashboardPage() {
  const data = await loadDashboardData();
  if (!data) redirect("/login");
  return <DashboardHome data={data} />;
}
