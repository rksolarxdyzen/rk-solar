import { Card } from "@/components/ui/card";
import { formatQty } from "@/lib/inventory/format";
import type { CategoryStockGroup } from "@/lib/inventory/category-stock";

export function CategoryStockReport({ groups }: { groups: CategoryStockGroup[] }) {
  const any = groups.some((g) => g.item_count > 0);
  if (!any) {
    return (
      <Card className="mb-4 py-6 text-center text-sm text-[var(--text-muted)]" data-testid="stock-category-report">
        No solar panel or inverter items in this report.
      </Card>
    );
  }

  return (
    <div className="mb-6 space-y-4" data-testid="stock-category-report">
      <div>
        <h2 className="text-base font-bold text-[var(--text-dark)]">Panels and inverters</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Totals by category, then company and wattage. On hand is as of now.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.kind} className="overflow-hidden p-0">
            <div className="flex items-baseline justify-between gap-2 border-b border-[var(--border-light)] bg-[var(--bg)] px-4 py-3">
              <h3 className="text-sm font-bold text-[var(--text-dark)]">{group.label}</h3>
              <p className="text-sm font-semibold tabular-nums">
                {formatQty(group.on_hand, "nos")}
                <span className="ml-1 text-xs font-medium text-[var(--text-muted)]">
                  · {group.item_count} SKU{group.item_count === 1 ? "" : "s"}
                </span>
              </p>
            </div>
            {group.companies.length === 0 ? (
              <p className="px-4 py-4 text-sm text-[var(--text-muted)]">None in this list.</p>
            ) : (
              <div className="divide-y divide-[var(--border-light)]">
                {group.companies.map((company) => (
                  <div key={company.company} className="px-4 py-3">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <p className="font-semibold text-[var(--text-dark)]">{company.company}</p>
                      <p className="text-sm tabular-nums">{formatQty(company.on_hand, "nos")}</p>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {company.wattages.map((watt) => (
                          <tr key={watt.wattage}>
                            <td className="py-0.5 text-[var(--text-body)]">{watt.wattage}</td>
                            <td className="py-0.5 text-right tabular-nums">{formatQty(watt.on_hand, "nos")}</td>
                            <td className="w-16 py-0.5 pl-2 text-right text-xs text-[var(--text-muted)]">
                              {watt.item_count} SKU{watt.item_count === 1 ? "" : "s"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
