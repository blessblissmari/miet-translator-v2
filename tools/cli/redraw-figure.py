#!/usr/bin/env python3
"""redraw-figure.py — regenerate a chart on a clean white background.

Given a JSON description of a chart (produced by the OMNI model from a page
image), produce a PNG with matplotlib that has:
  - white background
  - Russian axis labels / legend / title
  - no compression artifacts from the original scan

JSON shape (read from stdin or --in file):

    {
      "kind": "line" | "bar" | "scatter",
      "title": "АЧХ фильтра",
      "xlabel": "Частота, Гц",
      "ylabel": "|H(f)|, дБ",
      "series": [
        { "name": "FIR N=64", "x": [0, 100, ...], "y": [0, -1.2, ...] }
      ],
      "legend": true,
      "grid": true
    }

Usage:
    python3 redraw-figure.py --in fig.json --out fig.png
    cat fig.json | python3 redraw-figure.py --out fig.png
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


def render(spec: dict, out_path: Path, dpi: int = 200) -> None:
    fig, ax = plt.subplots(figsize=(spec.get("width", 7), spec.get("height", 4.2)))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    kind = spec.get("kind", "line")
    series = spec.get("series", [])

    for i, s in enumerate(series):
        x = s.get("x", list(range(len(s.get("y", [])))))
        y = s.get("y", [])
        name = s.get("name", f"series {i + 1}")
        if kind == "line":
            ax.plot(x, y, label=name, linewidth=1.5)
        elif kind == "bar":
            ax.bar(x, y, label=name)
        elif kind == "scatter":
            ax.scatter(x, y, label=name, s=18)
        else:
            ax.plot(x, y, label=name)

    if spec.get("title"):
        ax.set_title(spec["title"])
    if spec.get("xlabel"):
        ax.set_xlabel(spec["xlabel"])
    if spec.get("ylabel"):
        ax.set_ylabel(spec["ylabel"])
    if spec.get("grid", True):
        ax.grid(True, linestyle=":", linewidth=0.6, alpha=0.7)
    if spec.get("legend", True) and series:
        ax.legend(loc="best", frameon=False)

    fig.tight_layout()
    fig.savefig(out_path, dpi=dpi, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="inp", help="JSON spec (default: stdin)")
    p.add_argument("--out", required=True, help="output PNG path")
    p.add_argument("--dpi", type=int, default=200)
    args = p.parse_args()

    raw = Path(args.inp).read_text(encoding="utf-8") if args.inp else sys.stdin.read()
    spec = json.loads(raw)
    render(spec, Path(args.out), dpi=args.dpi)
    print(f"wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
