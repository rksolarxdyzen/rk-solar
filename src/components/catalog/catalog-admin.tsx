"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  setCatalogItemActive,
  upsertCatalogBrand,
  upsertCatalogCategory,
  upsertCatalogItem,
} from "@/actions/catalog";
import { uploadQuoteItemImage } from "@/lib/quotations/actions/items";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/layout/page-header";
import { catalogItemMatchesTemplate } from "@/lib/quotations/types";

type Brand = { id: string; name: string; category: string | null };
type Category = { id: string; name: string; kind: string; sort_order: number };
type Item = {
  id: string;
  item_name: string;
  model: string | null;
  capacity_label: string | null;
  unit: string;
  gst_percent: number;
  base_rate: number;
  template_kind: string;
  warranty_text: string | null;
  image_url?: string | null;
  is_active: boolean;
  brand_id: string | null;
  category_id: string | null;
  brand?: { id: string; name: string } | { id: string; name: string }[] | null;
};

function brandName(item: Item) {
  const b = Array.isArray(item.brand) ? item.brand[0] : item.brand;
  return b?.name ?? "—";
}

function CategoryGroup({
  title,
  categories,
}: {
  title: string;
  categories: Category[];
}) {
  return (
    <section className="rounded-lg border border-[var(--border-light)] bg-[var(--bg)] p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </h3>
      {categories.length > 0 ? (
        <ul className="mt-2 divide-y divide-[var(--border-light)] text-sm">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center justify-between gap-2 py-2">
              <span className="font-medium text-[var(--text-dark)]">{category.name}</span>
              {category.kind === "both" && (
                <span className="text-xs text-[var(--text-muted)]">Both</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[var(--text-muted)]">No categories yet.</p>
      )}
    </section>
  );
}

export function CatalogAdmin({
  items,
  brands,
  categories,
  canManage,
}: {
  items: Item[];
  brands: Brand[];
  categories: Category[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [tab, setTab] = useState<"items" | "brands" | "categories">("items");
  const [itemKindTab, setItemKindTab] = useState<"solar" | "premium" | "general">("solar");
  const [showItemForm, setShowItemForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const [itemName, setItemName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [gst, setGst] = useState("0");
  const [rate, setRate] = useState("0");
  const [kind, setKind] = useState<"solar" | "premium" | "non_solar" | "both">("solar");
  const [categoryId, setCategoryId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);

  const [brandNameInput, setBrandNameInput] = useState("");
  const [brandCat, setBrandCat] = useState("");
  const [catName, setCatName] = useState("");
  const [catKind, setCatKind] = useState<"solar" | "premium" | "non_solar" | "both">("solar");

  function refresh(msg: string) {
    setOk(msg);
    setError(null);
    router.refresh();
  }

  function resetItemForm() {
    setEditingId(null);
    setEditOpen(false);
    setItemName("");
    setCapacity("");
    setUnit("pcs");
    setGst("0");
    setRate("0");
    setKind("solar");
    setCategoryId("");
    setImageUrl("");
    setImageFile(null);
  }

  function loadItem(item: Item) {
    setEditingId(item.id);
    setItemName(item.item_name);
    setCapacity(item.capacity_label ?? "");
    setUnit(item.unit || "pcs");
    setGst(String(item.gst_percent));
    setRate(String(item.base_rate));
    setKind((item.template_kind as "solar" | "premium" | "non_solar" | "both") || "solar");
    setCategoryId(item.category_id ?? "");
    setImageUrl(item.image_url ?? "");
    setImageFile(null);
    setTab("items");
    setEditOpen(true);
    setError(null);
    setOk(null);
  }

  function submitItem() {
    const wasEditing = Boolean(editingId);
    startTransition(async () => {
      try {
        const result = await upsertCatalogItem({
          id: editingId ?? undefined,
          itemName,
          model: null,
          capacityLabel: capacity || null,
          unit,
          gstPercent: kind === "non_solar" ? Number(gst) || 0 : 0,
          baseRate: kind === "non_solar" ? Number(rate) || 0 : 0,
          templateKind: kind,
          brandId: null,
          categoryId: categoryId || null,
          imageUrl: imageUrl || null,
        });
        if (imageFile) {
          const formData = new FormData();
          formData.set("file", imageFile);
          await uploadQuoteItemImage(result.id, formData);
        }
        resetItemForm();
        refresh(wasEditing ? "Item updated" : "Item created");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  const visible = items.filter((item) => {
    if (activeOnly && item.is_active === false) return false;
    if (itemKindTab === "solar") {
      return catalogItemMatchesTemplate(item, "solar");
    }
    if (itemKindTab === "premium") {
      return catalogItemMatchesTemplate(item, "premium");
    }
    return catalogItemMatchesTemplate(item, "non_solar");
  });
  const compatibleCategories = categories.filter(
    (category) => kind === "both" || category.kind === "both" || category.kind === kind
  );
  const solarCategories = categories.filter(
    (category) => category.kind === "solar" || category.kind === "both"
  );
  const premiumCategories = categories.filter(
    (category) => category.kind === "premium" || category.kind === "both"
  );
  const generalCategories = categories.filter(
    (category) => category.kind === "non_solar" || category.kind === "both"
  );

  const itemFields = (
    <>
      <div>
        <Label>Name</Label>
        <Input required value={itemName} onChange={(e) => setItemName(e.target.value)} />
      </div>
      <div>
        <Label>Capacity</Label>
        <Input value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </div>
      <div>
        <Label>Unit</Label>
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
      <div>
        <Label>Type</Label>
        <Select
          value={kind}
          onChange={(e) => {
            const nextKind = e.target.value as "solar" | "premium" | "non_solar" | "both";
            setKind(nextKind);
            if (nextKind !== "non_solar") {
              setRate("0");
              setGst("0");
            } else if (!Number(rate)) {
              setGst((prev) => (prev === "0" ? "18" : prev));
            }
            if (
              categoryId &&
              !categories.some(
                (category) =>
                  category.id === categoryId &&
                  (nextKind === "both" ||
                    category.kind === "both" ||
                    category.kind === nextKind)
              )
            ) {
              setCategoryId("");
            }
          }}
        >
          <option value="solar">Solar</option>
          <option value="premium">Premium</option>
          <option value="non_solar">Non-solar</option>
          <option value="both">Solar + Non-solar</option>
        </Select>
      </div>
      <div>
        <Label>Category</Label>
        <Select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">—</option>
          {compatibleCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      {kind === "non_solar" && (
        <>
          <div>
            <Label>Base rate (₹)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              required
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <div>
            <Label>GST %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={gst}
              onChange={(e) => setGst(e.target.value)}
            />
          </div>
        </>
      )}
      <div className="sm:col-span-2">
        <Label>Image URL</Label>
        <Input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="/brand/bom-premium/01-….png"
        />
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="mt-2 h-16 w-16 rounded-lg border border-[var(--border-light)] bg-white object-contain"
          />
        ) : null}
      </div>
      <div className="sm:col-span-2">
        <Label>Upload image</Label>
        <Input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Optional. Images must be under 8 MB.
          {imageFile ? ` Selected: ${imageFile.name}` : ""}
        </p>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Catalogue"
        subtitle={
          canManage
            ? "Manage brands, categories, and quote line items."
            : "Browse active items used in quotations."
        }
        className="mb-0"
      />

      {error && !editOpen && (
        <p className="text-sm text-[var(--error)]">{error}</p>
      )}
      {ok && <p className="text-sm text-[var(--success)]">{ok}</p>}

      {canManage && (
        <div className="flex gap-1 border-b border-[var(--border)]">
          {(["items", "brands", "categories"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2 text-sm font-medium capitalize ${
                tab === t
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--text-muted)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {canManage && tab === "items" && !editOpen && (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setShowItemForm((current) => !current)}
          >
            {showItemForm ? "Hide add item" : "Add item"}
          </Button>
          {showItemForm && (
            <form
              className="grid gap-3 rounded-xl border border-[var(--border)] bg-white p-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitItem();
              }}
            >
              <div className="sm:col-span-2">
                <p className="text-sm font-semibold">Add item</p>
              </div>
              {itemFields}
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit" size="sm" disabled={pending}>
                  Add item
                </Button>
              </div>
            </form>
          )}
        </>
      )}

      {canManage && tab === "brands" && (
        <div className="space-y-3">
          <form
            className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                try {
                  await upsertCatalogBrand({
                    name: brandNameInput,
                    category: brandCat || null,
                  });
                  setBrandNameInput("");
                  setBrandCat("");
                  refresh("Brand added");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed");
                }
              });
            }}
          >
            <div className="min-w-[10rem] flex-1">
              <Label>Brand</Label>
              <Input
                required
                value={brandNameInput}
                onChange={(e) => setBrandNameInput(e.target.value)}
                placeholder="Brand name"
              />
            </div>
            <div className="min-w-[8rem] flex-1">
              <Label>Tag</Label>
              <Input
                value={brandCat}
                onChange={(e) => setBrandCat(e.target.value)}
                placeholder="Optional tag"
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              Add
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {brands.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No brands yet.</p>
            ) : (
              brands.map((b) => (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-dark)]"
                >
                  {b.name}
                  {b.category ? (
                    <span className="text-[var(--text-muted)]">· {b.category}</span>
                  ) : null}
                </span>
              ))
            )}
          </div>
        </div>
      )}

      {canManage && tab === "categories" && (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setShowCategoryForm((current) => !current)}
          >
            {showCategoryForm ? "Hide add category" : "Add category"}
          </Button>
          {showCategoryForm && (
            <form
              className="grid gap-3 rounded-xl border border-[var(--border)] bg-white p-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  try {
                    await upsertCatalogCategory({ name: catName, kind: catKind });
                    setCatName("");
                    setShowCategoryForm(false);
                    refresh("Category added");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed");
                  }
                });
              }}
            >
              <div>
                <Label>Category name</Label>
                <Input required value={catName} onChange={(e) => setCatName(e.target.value)} />
              </div>
              <div>
                <Label>Kind</Label>
                <Select
                  value={catKind}
                  onChange={(e) =>
                    setCatKind(e.target.value as "solar" | "premium" | "non_solar" | "both")
                  }
                >
                  <option value="solar">Solar</option>
                  <option value="premium">Premium</option>
                  <option value="non_solar">Non-solar</option>
                  <option value="both">Solar + Non-solar</option>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" disabled={pending}>
                  Add category
                </Button>
              </div>
            </form>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <CategoryGroup title="Solar categories" categories={solarCategories} />
            <CategoryGroup title="Premium categories" categories={premiumCategories} />
            <CategoryGroup title="Non-solar categories" categories={generalCategories} />
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-white p-1">
          {(["solar", "premium", "general"] as const).map((kindTab) => (
            <button
              key={kindTab}
              type="button"
              onClick={() => setItemKindTab(kindTab)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                itemKindTab === kindTab
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg)]"
              }`}
            >
              {kindTab === "solar"
                ? "Solar items"
                : kindTab === "premium"
                  ? "Premium items"
                  : "Non-solar items"}
            </button>
          ))}
        </div>
        {canManage && (
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
            />
            Active only
          </label>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Capacity</th>
              {canManage && <th className="px-3 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visible.length > 0 ? visible.map((item) => (
              <tr
                key={item.id}
                className={`border-b border-[var(--border-light)] ${
                  !item.is_active ? "opacity-50" : ""
                }`}
              >
                <td className="px-3 py-2 font-medium text-[var(--text-dark)]">
                  <div className="flex items-center gap-3">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg border border-[var(--border-light)] bg-white object-contain"
                      />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)]" />
                    )}
                    <div className="min-w-0">
                      {item.item_name}
                      {item.model ? (
                        <span className="block text-xs text-[var(--text-muted)]">
                          {item.model}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">{brandName(item)}</td>
                <td className="px-3 py-2">{item.capacity_label ?? "—"}</td>
                {canManage && (
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => loadItem(item)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            try {
                              await setCatalogItemActive(item.id, !item.is_active);
                              refresh(item.is_active ? "Deactivated" : "Activated");
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Failed");
                            }
                          })
                        }
                      >
                        {item.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            )) : (
              <tr>
                <td
                  colSpan={canManage ? 7 : 6}
                  className="px-3 py-8 text-center text-sm text-[var(--text-muted)]"
                >
                  No {itemKindTab} catalogue items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={editOpen && Boolean(editingId)}
        onClose={resetItemForm}
        title="Edit catalogue item"
        subtitle={itemName || undefined}
        size="lg"
      >
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitItem();
          }}
        >
          {itemFields}
          {error && (
            <p className="sm:col-span-2 text-sm text-[var(--error)]">{error}</p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save item"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={resetItemForm}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
