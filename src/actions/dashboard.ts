"use server";

import { loadDashboardData } from "@/lib/dashboard/load-dashboard";

/** Client-callable wrapper — do not import load-dashboard from client modules. */
export async function fetchDashboardData() {
  return loadDashboardData();
}
