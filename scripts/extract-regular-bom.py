"""Extract regular BOM item images from LIST OF MATERIALS (REGULAR) PDF."""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent.parent
PDF_CANDIDATES = [
    ROOT / "LIST OF MATERIALS (REGULAR) (1).pdf",
    ROOT / "LIST OF MATERIALS (REGULAR).pdf",
    REPO / "LIST OF MATERIALS (REGULAR) (1).pdf",
    REPO / "LIST OF MATERIALS (REGULAR).pdf",
]
OUT = ROOT / "public" / "brand" / "bom-regular"
PREMIUM = ROOT / "public" / "brand" / "bom-premium"

# Prefer premium earthing-cables crop if Regular PDF crop is missing for #10
PREMIUM_FALLBACKS = {
    10: "14-earthing-cables.png",
}


def main() -> None:
    PDF = next((p for p in PDF_CANDIDATES if p.exists()), None)
    if PDF is None:
        raise SystemExit(f"Missing PDF. Tried: {', '.join(str(p) for p in PDF_CANDIDATES)}")

    print("Using", PDF)
    OUT.mkdir(parents=True, exist_ok=True)
    for p in OUT.glob("*.png"):
        p.unlink()

    doc = fitz.open(PDF)
    components: list[dict] = []

    for pi, page in enumerate(doc):
        d = page.get_text("dict")
        lines: list[tuple[float, str]] = []
        for b in d["blocks"]:
            if b.get("type") != 0:
                continue
            for line in b.get("lines", []):
                t = "".join(s["text"] for s in line["spans"]).strip()
                if t:
                    lines.append((line["bbox"][1], t))
        lines.sort()

        headers: list[dict] = []
        for y, t in lines:
            m = re.match(r"^(\d+)\)\s+Component:\s*(.+)$", t)
            m2 = re.match(r"^(\d+)\)\s+FOUNDATION$", t)
            if m:
                headers.append({"num": int(m.group(1)), "name": m.group(2).strip(), "y": y, "page": pi})
            elif m2:
                headers.append(
                    {"num": int(m2.group(1)), "name": "Standard Structure Foundation", "y": y, "page": pi}
                )

        imgs: list[dict] = []
        for b in d["blocks"]:
            if b.get("type") != 1:
                continue
            x0, y0, x1, y1 = b["bbox"]
            w, h = x1 - x0, y1 - y0
            if h < 15 or w < 30 or y1 < 70:
                continue
            imgs.append({"bbox": (x0, y0, x1, y1), "area": w * h})

        headers.sort(key=lambda h: h["y"])
        for i, h in enumerate(headers):
            y0 = h["y"] - 5
            y1 = headers[i + 1]["y"] - 5 if i + 1 < len(headers) else page.rect.height
            cand = [
                im
                for im in imgs
                if y0 <= (im["bbox"][1] + im["bbox"][3]) / 2 < y1
                and im["area"] < page.rect.width * page.rect.height * 0.5
            ]
            cand.sort(key=lambda im: -im["area"])
            h["images"] = cand[:3]
            components.append(h)

    mapping = []
    for h in components:
        page = doc[h["page"]]
        slug = re.sub(r"[^a-z0-9]+", "-", h["name"].lower()).strip("-")[:50]
        fname = f"{h['num']:02d}-{slug}.png"
        path = OUT / fname
        saved = None
        if h["images"]:
            b = h["images"][0]["bbox"]
            r = page.rect
            clip = fitz.Rect(
                max(0, b[0] - 6),
                max(0, b[1] - 6),
                min(r.width, b[2] + 6),
                min(r.height, b[3] + 6),
            )
            pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), clip=clip, alpha=False)
            pix.save(str(path))
            saved = fname
        elif h["num"] in PREMIUM_FALLBACKS and PREMIUM.exists():
            src = PREMIUM / PREMIUM_FALLBACKS[h["num"]]
            if src.exists():
                # Keep Regular naming for #10 even when copying premium pixels
                shutil.copy(src, path)
                saved = fname
        elif PREMIUM.exists():
            premium_match = PREMIUM / fname
            if premium_match.exists():
                shutil.copy(premium_match, path)
                saved = fname

        mapping.append(
            {
                "num": h["num"],
                "name": h["name"],
                "page": h["page"] + 1,
                "image": saved,
                "image_count": len(h["images"]),
            }
        )
        print(h["num"], h["name"], "->", saved)

    # Ensure #10 exists even if PDF header parse skipped it
    nums = {row["num"] for row in mapping}
    if 10 not in nums:
        fname = "10-earthing-cables.png"
        path = OUT / fname
        src = PREMIUM / "14-earthing-cables.png"
        if src.exists():
            shutil.copy(src, path)
            mapping.append(
                {
                    "num": 10,
                    "name": "Earthing Cables",
                    "page": 2,
                    "image": fname,
                    "image_count": 0,
                }
            )
            print(10, "Earthing Cables (fallback) ->", fname)

    mapping.sort(key=lambda r: r["num"])
    (OUT / "_items.json").write_text(json.dumps(mapping, indent=2), encoding="utf-8")
    print("done", len(mapping), "->", OUT)


if __name__ == "__main__":
    main()
