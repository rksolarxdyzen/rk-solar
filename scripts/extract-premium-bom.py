"""Extract premium BOM item images from the materials PDF."""
from __future__ import annotations

import json
import re
from pathlib import Path

import fitz

PDF = Path(__file__).resolve().parents[1] / "LIST OF MATERIALS (PRIMIUM) (1).pdf"
OUT = Path(__file__).resolve().parents[1] / "public" / "brand" / "bom-premium"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for p in OUT.glob("*.png"):
        p.unlink()
    for p in OUT.glob("*.jpg"):
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
                headers.append(
                    {
                        "num": int(m.group(1)),
                        "name": m.group(2).strip(),
                        "y": y,
                        "page": pi,
                    }
                )
            elif m2:
                headers.append(
                    {
                        "num": int(m2.group(1)),
                        "name": "Standard Structure Foundation",
                        "y": y,
                        "page": pi,
                    }
                )

        imgs: list[dict] = []
        for b in d["blocks"]:
            if b.get("type") != 1:
                continue
            x0, y0, x1, y1 = b["bbox"]
            w, h = x1 - x0, y1 - y0
            if h < 15 or w < 30:
                continue
            if y1 < 70:
                continue
            imgs.append({"bbox": (x0, y0, x1, y1), "area": w * h})

        headers.sort(key=lambda h: h["y"])
        for i, h in enumerate(headers):
            y0 = h["y"] - 5
            y1 = (
                headers[i + 1]["y"] - 5
                if i + 1 < len(headers)
                else page.rect.height
            )
            cand = []
            for im in imgs:
                cy = (im["bbox"][1] + im["bbox"][3]) / 2
                if y0 <= cy < y1 and im["area"] < page.rect.width * page.rect.height * 0.5:
                    cand.append(im)
            cand.sort(key=lambda im: -im["area"])
            h["images"] = cand[:3]
            components.append(h)

    mapping = []
    for h in components:
        page = doc[h["page"]]
        slug = re.sub(r"[^a-z0-9]+", "-", h["name"].lower()).strip("-")[:50]
        fname = f"{h['num']:02d}-{slug}.png"
        path = OUT / fname
        if h["images"]:
            # Prefer a single clean product crop (largest image in the section).
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
        else:
            fname = None
        mapping.append(
            {
                "num": h["num"],
                "name": h["name"],
                "page": h["page"] + 1,
                "image": fname,
                "image_count": len(h["images"]),
            }
        )
        print(h["num"], h["name"], "->", fname, "imgs", len(h["images"]))

    (OUT / "_items.json").write_text(json.dumps(mapping, indent=2), encoding="utf-8")
    print("done", len(mapping))


if __name__ == "__main__":
    main()
