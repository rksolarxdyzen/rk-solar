/** RK LMS authority catalog ΓÇö keys match supabase/migrations/002_lms.sql */

export const AUTHORITY_GROUPS = {
  general: "Team & Access",
  sales: "Lead Management",
  inventory: "Inventory",
} as const;

export type AuthorityGroup = keyof typeof AUTHORITY_GROUPS;

export const AUTHORITIES = [
  {
    key: "full_access",
    label: "Full Access",
    description: "Unrestricted access across RK Bhabhor (overrides every other permission)",
    group: "general" as const,
  },
  {
    key: "manage_users",
    label: "Manage Team",
    description: "Add, edit, and deactivate team members on Team & Access",
    group: "general" as const,
  },
  {
    key: "manage_roles",
    label: "Manage Roles & Permissions",
    description: "Create roles and change what each role can do",
    group: "general" as const,
  },
  {
    key: "manage_settings",
    label: "Manage quotation numbering settings",
    description: "Change quotation number series and related company quote settings",
    group: "general" as const,
  },
  {
    key: "import_leads",
    label: "Import leads (Excel)",
    description: "Upload leads from Excel on Lead Import",
    group: "sales" as const,
  },
  {
    key: "distribute_leads",
    label: "Distribute imported leads",
    description: "Assign imported leads to tele-callers or surveyors",
    group: "sales" as const,
  },
  {
    key: "add_edit_leads",
    label: "Add / edit lead & customer details",
    description: "Create and update contact details on Pipeline and Customers",
    group: "sales" as const,
  },
  {
    key: "delete_leads",
    label: "Delete leads / customers",
    description: "Permanently delete a lead or won customer and related records",
    group: "sales" as const,
  },
  {
    key: "move_lead_stage",
    label: "Move pipeline stages",
    description: "Advance or move leads on the Pipeline board",
    group: "sales" as const,
  },
  {
    key: "reassign_leads",
    label: "Reassign leads",
    description: "Move leads between team members; allows backward pipeline moves",
    group: "sales" as const,
  },
  {
    key: "reopen_lost_leads",
    label: "Reopen lost leads",
    description: "Restore lost leads back to the active pipeline",
    group: "sales" as const,
  },
  {
    key: "view_all_leads",
    label: "View all leads & customers (not only assigned)",
    description: "See every company lead and customer file, not just ones assigned to you",
    group: "sales" as const,
  },
  {
    key: "log_sales_activity",
    label: "Log sales activity",
    description: "Log calls, visits, and follow-ups on leads",
    group: "sales" as const,
  },
  {
    key: "schedule_site_visit",
    label: "Schedule site visit",
    description: "Book survey visits and assign field slots",
    group: "sales" as const,
  },
  {
    key: "conduct_survey",
    label: "Conduct survey",
    description: "Mark survey in progress or completed",
    group: "sales" as const,
  },
  {
    key: "view_quotations",
    label: "View quotations",
    description:
      "Open Quotes list and quotation details (assigned leads + quotes you created, unless View all quotations is on)",
    group: "sales" as const,
  },
  {
    key: "view_all_quotations",
    label: "View all quotations",
    description: "See every company quotation, not only quotes for your assigned leads",
    group: "sales" as const,
  },
  {
    key: "create_quotations",
    label: "Create quotations",
    description: "Create and edit draft solar and general quotations",
    group: "sales" as const,
  },
  {
    key: "manage_quotations",
    label: "Manage quotations",
    description: "Full quotation management (includes delete where allowed)",
    group: "sales" as const,
  },
  {
    key: "delete_quotations",
    label: "Delete quotations",
    description: "Move draft / sent / rejected quotations to the Recycle bin",
    group: "sales" as const,
  },
  {
    key: "restore_quotations",
    label: "Restore quotations",
    description: "Open the quotation Recycle bin and restore deleted quotations",
    group: "sales" as const,
  },
  {
    key: "edit_quotation_pricing",
    label: "Edit quotation pricing",
    description: "Apply discounts and price overrides on quotes",
    group: "sales" as const,
  },
  {
    key: "accept_quotations",
    label: "Accept quotations",
    description: "Mark quotations accepted and advance the lead to Won",
    group: "sales" as const,
  },
  {
    key: "manage_catalog_items",
    label: "Manage catalogue items",
    description: "Maintain quotation catalogue brands and items",
    group: "sales" as const,
  },
  {
    key: "record_payment",
    label: "Record payment",
    description: "Enter token / pre-dispatch / final payment details",
    group: "sales" as const,
  },
  {
    key: "verify_payment",
    label: "Verify payment",
    description: "Accounts: verify txn ID, date, and bank credit",
    group: "sales" as const,
  },
  {
    key: "upload_feasibility_report",
    label: "Upload feasibility report",
    description: "Submit grid feasibility PDF after Won / token",
    group: "sales" as const,
  },
  {
    key: "approve_feasibility_report",
    label: "Approve feasibility report",
    description: "Approve or reject feasibility reports",
    group: "sales" as const,
  },
  {
    key: "view_payment_queues",
    label: "View payment queues",
    description: "Open Payments queues (also unlocks Receivables)",
    group: "sales" as const,
  },
  {
    key: "assign_installation_crew",
    label: "Assign installation crew",
    description: "Assign crew after pre-dispatch is verified",
    group: "sales" as const,
  },
  {
    key: "upload_installation_proofs",
    label: "Upload installation proofs",
    description: "Upload site / overview installation photos",
    group: "sales" as const,
  },
  {
    key: "upload_panel_barcodes",
    label: "Upload panel barcodes",
    description: "Upload panel barcode / DCR serial photos",
    group: "sales" as const,
  },
  {
    key: "complete_installation",
    label: "Complete installation",
    description: "Mark installation complete and notify teams",
    group: "sales" as const,
  },
  {
    key: "view_installation_queue",
    label: "View installation queue",
    description: "Open Installation assignment and crew queues",
    group: "sales" as const,
  },
  {
    key: "manage_liaison",
    label: "Work Documentation / Discom queue",
    description: "Work meter and subsidy follow-ups on Documentation",
    group: "sales" as const,
  },
  {
    key: "mark_meter_installed",
    label: "Mark meter installed",
    description: "Staff override for meter installed (customer portal preferred)",
    group: "sales" as const,
  },
  {
    key: "mark_subsidy_received",
    label: "Mark subsidy received",
    description: "Staff assist marking subsidy received",
    group: "sales" as const,
  },
  {
    key: "verify_subsidy",
    label: "Verify subsidy payment",
    description: "Accounts verifies subsidy bank credit and issues certificate",
    group: "sales" as const,
  },
  {
    key: "manage_portal_documents",
    label: "Manage portal documents",
    description: "Upload invoices and declarations visible in the customer portal",
    group: "sales" as const,
  },
  {
    key: "view_customer_portal_admin",
    label: "View portal codes & customer portal status",
    description: "See portal codes and customer-facing project status",
    group: "sales" as const,
  },
  {
    key: "view_service_tickets",
    label: "View service tickets",
    description: "Open Service / maintenance ticket queues",
    group: "sales" as const,
  },
  {
    key: "accept_service_ticket",
    label: "Accept service ticket",
    description: "Claim a raised maintenance ticket (first accept wins)",
    group: "sales" as const,
  },
  {
    key: "resolve_service_ticket",
    label: "Resolve service ticket",
    description: "Work and close tickets with proof photos",
    group: "sales" as const,
  },
  {
    key: "force_assign_service_ticket",
    label: "Force-assign service ticket",
    description: "Supervisor assigns an engineer when unclaimed or rejected",
    group: "sales" as const,
  },
  {
    key: "enqueue_cleaning_reminders",
    label: "Enqueue cleaning reminders",
    description: "Queue 15-day panel cleaning + referral nudges",
    group: "sales" as const,
  },
  {
    key: "view_grievances",
    label: "View grievances",
    description: "Open the internal company grievance queue",
    group: "general" as const,
  },
  {
    key: "raise_grievance",
    label: "Raise grievance",
    description: "File an internal company issue",
    group: "general" as const,
  },
  {
    key: "escalate_grievance",
    label: "Escalate grievance",
    description: "Escalate and reassign internal grievances",
    group: "general" as const,
  },
  {
    key: "resolve_grievance",
    label: "Resolve grievance",
    description: "Mark internal grievances resolved",
    group: "general" as const,
  },
  {
    key: "submit_dealer_commission",
    label: "Submit dealer commission",
    description: "Submit commission amount/% on a completed dealer file",
    group: "sales" as const,
  },
  {
    key: "approve_dealer_commission",
    label: "Approve dealer commission",
    description: "Accounts approve or reject dealer commission forms",
    group: "sales" as const,
  },
  {
    key: "assign_dealer",
    label: "Assign dealer",
    description: "Link a dealer profile to a lead / customer file",
    group: "sales" as const,
  },
  {
    key: "view_reports",
    label: "View reports",
    description: "Open sales and operations report sections on the dashboard",
    group: "general" as const,
  },
  {
    key: "view_sales_rep_report",
    label: "Sales rep monthly report",
    description:
      "Open the Sales report page: closed deals and payments by sales rep and month",
    group: "general" as const,
  },
  {
    key: "view_dealer_monthly_report",
    label: "Dealer monthly report",
    description:
      "Open the Dealer report page: monthly leads, won files, and quotations by external dealer",
    group: "general" as const,
  },
  {
    key: "view_inventory",
    label: "View Inventory",
    description: "See stock, items, serial numbers, movements, and a customer's material",
    group: "inventory" as const,
  },
  {
    key: "manage_inventory_items",
    label: "Manage Inventory Items",
    description: "Create and edit inventory items, units, and low-stock levels",
    group: "inventory" as const,
  },
  {
    key: "inventory_inward",
    label: "Stock Inward",
    description: "Record purchases and opening stock, including serial scanning and Excel import",
    group: "inventory" as const,
  },
  {
    key: "inventory_dispatch",
    label: "Dispatch to Customers",
    description: "Dispatch material to customers and print delivery challans",
    group: "inventory" as const,
  },
  {
    key: "inventory_return",
    label: "Customer Returns",
    description: "Record material returned from customer sites",
    group: "inventory" as const,
  },
  {
    key: "inventory_adjust",
    label: "Stock Adjustments & Reversals",
    description: "Correct stock, mark serials defective or scrapped, and reverse entries",
    group: "inventory" as const,
  },
  {
    key: "view_purchase_cost",
    label: "View Purchase Cost & Stock Value",
    description:
      "See purchase cost of items and the value of stock. Only an Admin can grant this.",
    group: "inventory" as const,
  },
  {
    key: "manage_purchase_cost",
    label: "Set Purchase Cost",
    description:
      "Enter and edit purchase cost on items and inward. Only an Admin can grant this.",
    group: "inventory" as const,
  },
] as const;

export type AuthorityKey = (typeof AUTHORITIES)[number]["key"];

export const AUTHORITY_KEYS = AUTHORITIES.map((a) => a.key) as AuthorityKey[];

const AUTHORITY_BY_KEY = new Map(
  AUTHORITIES.map((authority) => [authority.key as AuthorityKey, authority])
);

/** Page-shaped layout for Team & Access permissions UI (DB group stays general/sales). */
export type AuthorityUiSectionDef = {
  id: string;
  title: string;
  hint: string;
  keys: readonly AuthorityKey[];
  /** Optional note under the section (no extra checkboxes). */
  note?: string;
};

export const AUTHORITY_UI_SECTIONS: readonly AuthorityUiSectionDef[] = [
  {
    id: "general",
    title: "General",
    hint: "Team & Access ┬╖ dashboard reports",
    keys: [
      "full_access",
      "manage_users",
      "manage_roles",
      "manage_settings",
      "view_reports",
    ],
  },
  {
    id: "reports",
    title: "Reports",
    hint: "/reports/sales-reps ┬╖ /reports/dealers",
    keys: ["view_sales_rep_report", "view_dealer_monthly_report"],
  },
  {
    id: "pipeline_customers",
    title: "Pipeline & Customers",
    hint: "/pipeline ┬╖ /customers ┬╖ /lead-import",
    keys: [
      "view_all_leads",
      "add_edit_leads",
      "delete_leads",
      "move_lead_stage",
      "reassign_leads",
      "reopen_lost_leads",
      "log_sales_activity",
      "schedule_site_visit",
      "conduct_survey",
      "import_leads",
      "distribute_leads",
    ],
  },
  {
    id: "quotes",
    title: "Quotes & Catalogue",
    hint: "/quotations ┬╖ /quotations/bin ┬╖ /catalog",
    keys: [
      "view_quotations",
      "view_all_quotations",
      "create_quotations",
      "manage_quotations",
      "delete_quotations",
      "restore_quotations",
      "edit_quotation_pricing",
      "accept_quotations",
      "manage_catalog_items",
    ],
  },
  {
    id: "payments",
    title: "Payments",
    hint: "/payments ┬╖ /accounts/receivables",
    note: "Also opens Receivables when View payment queues or Verify payment is on.",
    keys: ["view_payment_queues", "record_payment", "verify_payment"],
  },
  {
    id: "documentation",
    title: "Documentation",
    hint: "/liaison ┬╖ /feasibility ┬╖ customer portal docs",
    keys: [
      "manage_liaison",
      "upload_feasibility_report",
      "approve_feasibility_report",
      "mark_meter_installed",
      "mark_subsidy_received",
      "verify_subsidy",
      "manage_portal_documents",
      "view_customer_portal_admin",
    ],
  },
  {
    id: "installation",
    title: "Installation",
    hint: "/installation",
    keys: [
      "view_installation_queue",
      "assign_installation_crew",
      "upload_installation_proofs",
      "upload_panel_barcodes",
      "complete_installation",
    ],
  },
  {
    id: "service",
    title: "Service",
    hint: "/maintenance",
    keys: [
      "view_service_tickets",
      "accept_service_ticket",
      "resolve_service_ticket",
      "force_assign_service_ticket",
      "enqueue_cleaning_reminders",
    ],
  },
  {
    id: "dealers",
    title: "Dealers",
    hint: "/dealers",
    keys: ["assign_dealer", "submit_dealer_commission", "approve_dealer_commission"],
  },
  {
    id: "grievances",
    title: "Grievances",
    hint: "/grievances",
    keys: [
      "view_grievances",
      "raise_grievance",
      "escalate_grievance",
      "resolve_grievance",
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    hint: "/inventory · stock · dispatch · returns · challans",
    note: "Purchase cost keys can only be granted by an Admin.",
    keys: [
      "view_inventory",
      "manage_inventory_items",
      "inventory_inward",
      "inventory_dispatch",
      "inventory_return",
      "inventory_adjust",
      "view_purchase_cost",
      "manage_purchase_cost",
    ],
  },
] as const;

function assertAuthorityUiSectionsComplete() {
  const seen = new Map<string, string>();
  for (const section of AUTHORITY_UI_SECTIONS) {
    for (const key of section.keys) {
      if (seen.has(key)) {
        throw new Error(
          `Authority UI section duplicate: ${key} in "${seen.get(key)}" and "${section.id}"`
        );
      }
      seen.set(key, section.id);
    }
  }
  for (const key of AUTHORITY_KEYS) {
    if (!seen.has(key)) {
      throw new Error(`Authority UI sections missing key: ${key}`);
    }
  }
  if (seen.size !== AUTHORITY_KEYS.length) {
    throw new Error(
      `Authority UI sections size mismatch: ${seen.size} vs ${AUTHORITY_KEYS.length}`
    );
  }
}

assertAuthorityUiSectionsComplete();

export type AuthorityCatalogRow = {
  key: string;
  label: string;
  authority_group: string;
  description?: string;
};

export type AuthorityUiItem = {
  key: AuthorityKey;
  label: string;
  description: string;
  authority_group: string;
};

export type AuthorityUiSection = {
  id: string;
  title: string;
  hint: string;
  note?: string;
  items: AuthorityUiItem[];
};

/** Merge DB catalog rows with TS labels/descriptions; order by AUTHORITY_UI_SECTIONS. */
export function getAuthorityUiSections(
  authoritiesFromDb: AuthorityCatalogRow[]
): AuthorityUiSection[] {
  const dbByKey = new Map(authoritiesFromDb.map((row) => [row.key, row]));

  return AUTHORITY_UI_SECTIONS.map((section) => {
    const items: AuthorityUiItem[] = [];
    for (const key of section.keys) {
      const catalog = AUTHORITY_BY_KEY.get(key);
      const db = dbByKey.get(key);
      if (!catalog && !db) continue;
      items.push({
        key,
        label: catalog?.label ?? db?.label ?? key,
        description: catalog?.description ?? db?.description ?? "",
        authority_group: db?.authority_group ?? catalog?.group ?? "sales",
      });
    }
    return {
      id: section.id,
      title: section.title,
      hint: section.hint,
      note: section.note,
      items,
    };
  }).filter((section) => section.items.length > 0);
}

const INVENTORY_OPS_KEYS: AuthorityKey[] = [
  "view_inventory",
  "manage_inventory_items",
  "inventory_inward",
  "inventory_dispatch",
  "inventory_return",
  "inventory_adjust",
];

/** Defaults when role_authorities / user_authorities are empty — mirrors migration seeds. */
export const DEFAULT_ROLE_AUTHORITIES: Record<string, AuthorityKey[]> = {
  // Admin gets every key except purchase-cost (grantor sees cost via canViewPurchaseCost / SQL).
  admin: AUTHORITY_KEYS.filter(
    (k) => k !== "view_purchase_cost" && k !== "manage_purchase_cost"
  ),
  "inventory-person": [
    "view_inventory",
    "manage_inventory_items",
    "inventory_inward",
    "inventory_dispatch",
    "inventory_return",
  ],
  sales_manager: [
    ...INVENTORY_OPS_KEYS.filter((k) =>
      ["view_inventory", "inventory_dispatch", "inventory_return"].includes(k)
    ),
    "import_leads",
    "distribute_leads",
    "add_edit_leads",
    "move_lead_stage",
    "reassign_leads",
    "reopen_lost_leads",
    "log_sales_activity",
    "schedule_site_visit",
    "conduct_survey",
    "view_quotations",
    "create_quotations",
    "manage_quotations",
    "edit_quotation_pricing",
    "accept_quotations",
    "manage_catalog_items",
    "record_payment",
    "view_payment_queues",
    "view_reports",
    "view_sales_rep_report",
    "view_dealer_monthly_report",
    "manage_users",
    "view_grievances",
    "raise_grievance",
    "escalate_grievance",
    "resolve_grievance",
    "submit_dealer_commission",
    "approve_dealer_commission",
    "assign_dealer",
  ],
  sales_executive: [
    "add_edit_leads",
    "move_lead_stage",
    "log_sales_activity",
    "view_quotations",
    "create_quotations",
    "edit_quotation_pricing",
    "accept_quotations",
    "record_payment",
    "view_payment_queues",
    "view_grievances",
    "raise_grievance",
  ],
  feasibility: [
    "upload_feasibility_report",
    "approve_feasibility_report",
    "view_payment_queues",
    "view_grievances",
    "raise_grievance",
  ],
  ops_coordinator: [
    "assign_installation_crew",
    "upload_installation_proofs",
    "upload_panel_barcodes",
    "complete_installation",
    "view_installation_queue",
    "view_grievances",
    "raise_grievance",
  ],
  installation_crew: [
    "upload_installation_proofs",
    "upload_panel_barcodes",
    "complete_installation",
    "view_installation_queue",
    "view_grievances",
    "raise_grievance",
  ],
  liaison: [
    "upload_feasibility_report",
    "manage_liaison",
    "mark_meter_installed",
    "mark_subsidy_received",
    "manage_portal_documents",
    "view_customer_portal_admin",
    "view_grievances",
    "raise_grievance",
  ],
  accounts: [
    "view_quotations",
    "view_all_quotations",
    "record_payment",
    "verify_payment",
    "view_payment_queues",
    "verify_subsidy",
    "view_customer_portal_admin",
    "view_grievances",
    "raise_grievance",
    "submit_dealer_commission",
    "approve_dealer_commission",
    "view_dealer_monthly_report",
  ],
  tele_caller: [
    "add_edit_leads",
    "move_lead_stage",
    "log_sales_activity",
    "schedule_site_visit",
    "view_quotations",
    "view_grievances",
    "raise_grievance",
  ],
  surveyor: [
    "conduct_survey",
    "log_sales_activity",
    "move_lead_stage",
    "view_quotations",
    "view_grievances",
    "raise_grievance",
  ],
  service_engineer: [
    "view_service_tickets",
    "accept_service_ticket",
    "resolve_service_ticket",
    "view_grievances",
    "raise_grievance",
  ],
  service_supervisor: [
    "view_service_tickets",
    "accept_service_ticket",
    "resolve_service_ticket",
    "force_assign_service_ticket",
    "enqueue_cleaning_reminders",
    "view_grievances",
    "raise_grievance",
  ],
  dealer: [
    "add_edit_leads",
    "log_sales_activity",
    "view_quotations",
    "submit_dealer_commission",
    "view_grievances",
    "raise_grievance",
  ],
};
