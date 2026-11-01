import type { AuthorityKey } from "@/lib/domain/authorities";
import type { UserRole } from "@/lib/domain/types";

export type NavAccessContext = {
  authorities: Iterable<string>;
  role: UserRole | string;
};

function hasAuthority(authorities: Set<string>, key: AuthorityKey): boolean {
  return authorities.has("full_access") || authorities.has(key);
}

/** Whether the user may open this dashboard route. */
export function canAccessNavHref(href: string, ctx: NavAccessContext): boolean {
  const auths = ctx.authorities instanceof Set ? ctx.authorities : new Set(ctx.authorities);
  const has = (key: AuthorityKey) => hasAuthority(auths, key);

  switch (href) {
    case "/":
    case "/pipeline":
    case "/leads":
    case "/customers":
    case "/alerts":
    case "/reminders":
      return true;
    case "/team":
      return (
        has("manage_users") ||
        has("manage_roles") ||
        ctx.role === "admin"
      );
    case "/lead-import":
      return has("import_leads") || has("distribute_leads");
    case "/quotations":
      return (
        has("view_quotations") ||
        has("create_quotations") ||
        has("manage_quotations") ||
        ctx.role === "admin" ||
        ctx.role === "sales_manager" ||
        ctx.role === "sales_executive"
      );
    case "/catalog":
      return (
        has("view_quotations") ||
        has("manage_catalog_items") ||
        has("create_quotations") ||
        ctx.role === "admin" ||
        ctx.role === "sales_manager"
      );
    case "/payments":
      return (
        has("view_payment_queues") ||
        has("record_payment") ||
        has("verify_payment") ||
        ctx.role === "admin" ||
        ctx.role === "sales_manager" ||
        ctx.role === "accounts" ||
        ctx.role === "sales_executive"
      );
    case "/accounts/receivables":
      return (
        has("view_payment_queues") ||
        has("verify_payment") ||
        ctx.role === "admin" ||
        ctx.role === "accounts" ||
        ctx.role === "sales_manager"
      );
    case "/reports/sales-reps":
      return has("view_sales_rep_report") || ctx.role === "admin";
    case "/reports/dealers":
      return (
        has("view_dealer_monthly_report") ||
        has("assign_dealer") ||
        has("approve_dealer_commission") ||
        ctx.role === "admin" ||
        ctx.role === "sales_manager" ||
        ctx.role === "accounts"
      );
    case "/feasibility":
      return (
        has("view_payment_queues") ||
        has("upload_feasibility_report") ||
        has("approve_feasibility_report") ||
        has("manage_liaison") ||
        ctx.role === "admin" ||
        ctx.role === "feasibility" ||
        ctx.role === "liaison" ||
        ctx.role === "sales_manager"
      );
    case "/installation":
      return (
        has("view_installation_queue") ||
        has("assign_installation_crew") ||
        has("upload_installation_proofs") ||
        has("complete_installation") ||
        ctx.role === "admin" ||
        ctx.role === "ops_coordinator" ||
        ctx.role === "installation_crew" ||
        ctx.role === "sales_manager"
      );
    case "/liaison":
    case "/documentation":
      return (
        has("manage_liaison") ||
        has("mark_meter_installed") ||
        has("mark_subsidy_received") ||
        has("verify_subsidy") ||
        has("manage_portal_documents") ||
        has("view_customer_portal_admin") ||
        has("upload_feasibility_report") ||
        ctx.role === "admin" ||
        ctx.role === "liaison" ||
        ctx.role === "feasibility" ||
        ctx.role === "accounts" ||
        ctx.role === "sales_manager"
      );
    case "/maintenance":
      return (
        has("view_service_tickets") ||
        has("accept_service_ticket") ||
        has("resolve_service_ticket") ||
        has("force_assign_service_ticket") ||
        ctx.role === "admin" ||
        ctx.role === "service_engineer" ||
        ctx.role === "service_supervisor" ||
        ctx.role === "sales_manager"
      );
    case "/grievances":
      // All staff can open the module; escalate/resolve gated in actions
      return true;
    case "/dealers":
      return (
        has("assign_dealer") ||
        has("approve_dealer_commission") ||
        has("submit_dealer_commission") ||
        ctx.role === "admin" ||
        ctx.role === "sales_manager" ||
        ctx.role === "accounts" ||
        ctx.role === "dealer"
      );
    case "/ingest":
      return (
        has("import_leads") ||
        has("add_edit_leads") ||
        has("view_all_leads") ||
        ctx.role === "admin" ||
        ctx.role === "sales_manager"
      );
    case "/inventory":
      return (
        has("view_inventory") ||
        has("manage_inventory_items") ||
        has("inventory_inward") ||
        has("inventory_dispatch") ||
        has("inventory_return") ||
        ctx.role === "admin"
      );
    default:
      // Nested inventory routes share the same gate
      if (href.startsWith("/inventory/")) {
        return canAccessNavHref("/inventory", ctx);
      }
      return true;
  }
}

export function filterNavItems<T extends { href: string }>(
  items: T[],
  ctx: NavAccessContext
): T[] {
  return items.filter((item) => canAccessNavHref(item.href, ctx));
}
