"""
Knowledge Graph Visualization Generator
Generates a sample knowledge graph PNG using NetworkX + matplotlib.
Based on actual MentorMind kg_concepts / kg_relationships schema.
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import networkx as nx
import numpy as np
from pathlib import Path

# ---- CJK font setup ----
_CJK_CANDIDATES = [
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
]
_CJK_FONT = None
for _fp in _CJK_CANDIDATES:
    if Path(_fp).exists():
        _CJK_FONT = fm.FontProperties(fname=_fp)
        break

if _CJK_FONT is None:
    # Fallback: use any available CJK font
    for _f in fm.fontManager.ttflist:
        if any(kw in _f.name.lower() for kw in ["cjk", "hei", "song", "ming", "noto sans sc"]):
            _CJK_FONT = fm.FontProperties(fname=_f.fname)
            break

# ---- 1. Define sample math concepts (matching Mentormind topic domain) ----
nodes = [
    {"name": "实数与代数式", "subject": "math", "mastery": 0.9, "importance": 5},   # mastered
    {"name": "一元一次方程", "subject": "math", "mastery": 0.85, "importance": 5},  # mastered
    {"name": "因式分解", "subject": "math", "mastery": 0.55, "importance": 4},     # learning
    {"name": "二次函数", "subject": "math", "mastery": 0.50, "importance": 5},     # learning
    {"name": "一元二次方程", "subject": "math", "mastery": 0.40, "importance": 4},  # learning
    {"name": "抛物线图像", "subject": "math", "mastery": 0.25, "importance": 3},    # struggling
    {"name": "韦达定理", "subject": "math", "mastery": 0.20, "importance": 3},      # struggling
    {"name": "判别式△", "subject": "math", "mastery": 0.35, "importance": 3},       # learning
]

# ---- 2. Define edges (matching kg_relationships edge types) ----
edges = [
    ("实数与代数式", "因式分解", "prerequisite", 0.9),
    ("实数与代数式", "一元一次方程", "prerequisite", 0.85),
    ("一元一次方程", "一元二次方程", "prerequisite", 0.8),
    ("因式分解", "一元二次方程", "prerequisite", 0.75),
    ("因式分解", "二次函数", "prerequisite", 0.6),
    ("一元二次方程", "二次函数", "contains", 0.9),
    ("二次函数", "抛物线图像", "contains", 0.85),
    ("一元二次方程", "判别式△", "contains", 0.8),
    ("一元二次方程", "韦达定理", "related_to", 0.7),
    ("抛物线图像", "韦达定理", "related_to", 0.5),
]

# ---- 3. Build NetworkX directed graph ----
G = nx.DiGraph()

for n in nodes:
    # Color based on mastery: green > 0.7, yellow 0.3-0.7, red < 0.3
    if n["mastery"] >= 0.7:
        color = "#4CAF50"  # green
        label_suffix = ""
    elif n["mastery"] >= 0.3:
        color = "#FFC107"  # yellow
        label_suffix = ""
    else:
        color = "#F44336"  # red
        label_suffix = ""

    G.add_node(
        n["name"],
        mastery=n["mastery"],
        importance=n["importance"],
        color=color,
        size=300 + n["importance"] * 200,
        label=n["name"] + label_suffix,
    )

for src, dst, kind, weight in edges:
    G.add_edge(src, dst, kind=kind, weight=weight)

# ---- 4. Layout and rendering ----
fig, ax = plt.subplots(1, 1, figsize=(16, 10), facecolor="#0D1117")
ax.set_facecolor("#0D1117")

# Use hierarchical layout for prerequisite chains
pos = nx.spring_layout(G, k=2.5, iterations=80, seed=42)

node_colors = [G.nodes[n]["color"] for n in G.nodes]
node_sizes = [G.nodes[n]["size"] for n in G.nodes]

# Draw edges
for u, v, data in G.edges(data=True):
    style = "solid" if data["kind"] == "prerequisite" else (
        "dashed" if data["kind"] == "contains" else "dotted"
    )
    nx.draw_networkx_edges(
        G, pos, edgelist=[(u, v)], ax=ax,
        edge_color="#555555", style=style, width=1.5,
        alpha=0.6, arrows=True, arrowsize=15,
        connectionstyle="arc3,rad=0.1",
    )

# Draw nodes
nx.draw_networkx_nodes(
    G, pos, ax=ax,
    node_color=node_colors, node_size=node_sizes,
    edgecolors="#FFFFFF", linewidths=1.5, alpha=0.95,
)

# Draw labels
for node, (x, y) in pos.items():
    ax.text(
        x, y + 0.06, G.nodes[node]["label"],
        fontsize=10, ha="center", va="center",
        fontweight="bold", color="#FFFFFF",
        fontproperties=_CJK_FONT,
        bbox=dict(
            boxstyle="round,pad=0.3",
            facecolor="#1A1A2E", edgecolor=G.nodes[node]["color"],
            linewidth=1.5, alpha=0.9,
        ),
    )

# ---- 5. Legend ----
legend_elements = [
    plt.Line2D([0], [0], marker="o", color="w", markerfacecolor="#4CAF50",
               markersize=14, label="已掌握 (Mastered ≥70%)"),
    plt.Line2D([0], [0], marker="o", color="w", markerfacecolor="#FFC107",
               markersize=14, label="学习中 (Learning 30-70%)"),
    plt.Line2D([0], [0], marker="o", color="w", markerfacecolor="#F44336",
               markersize=14, label="薄弱 (Struggling <30%)"),
    plt.Line2D([0], [0], color="#555555", linestyle="solid", linewidth=2,
               label="前置依赖 (Prerequisite)"),
    plt.Line2D([0], [0], color="#555555", linestyle="dashed", linewidth=2,
               label="包含关系 (Contains)"),
    plt.Line2D([0], [0], color="#555555", linestyle="dotted", linewidth=2,
               label="相关 (Related)"),
]
ax.legend(
    handles=legend_elements, loc="lower right",
    fontsize=9, facecolor="#1A1A2E", edgecolor="#333333",
    labelcolor="#CCCCCC", prop=_CJK_FONT,
)

ax.set_title(
    "MentorMind — Per-User Knowledge Graph: 一元二次方程 Domain",
    fontsize=16, fontweight="bold", color="#FFFFFF", pad=20,
    fontproperties=_CJK_FONT,
)
ax.axis("off")

plt.tight_layout()

# ---- 6. Save ----
output_path = Path(__file__).parent / "knowledge_graph.png"
fig.savefig(output_path, dpi=200, bbox_inches="tight", facecolor=fig.get_facecolor())
plt.close(fig)

print(f"Knowledge graph saved to: {output_path}")
print(f"Nodes: {G.number_of_nodes()}, Edges: {G.number_of_edges()}")
