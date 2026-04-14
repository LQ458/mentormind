"""
Diagram Generator
Renders structured chart specifications into base64 PNG images using matplotlib.
Used to convert LLM-generated chart descriptions into actual visual diagrams
for study guide content.
"""

import ast
import base64
import io
import json
import logging
import operator
import re
from typing import Any, Dict, List, Optional

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np

logger = logging.getLogger(__name__)

# Try to use a font that supports CJK characters
_CJK_FONTS = ["Noto Sans CJK SC", "SimHei", "Microsoft YaHei", "PingFang SC", "WenQuanYi Micro Hei"]
_FONT_FAMILY = "sans-serif"
for _f in _CJK_FONTS:
    if any(_f.lower() in f.name.lower() for f in fm.fontManager.ttflist):
        _FONT_FAMILY = _f
        break

plt.rcParams.update({
    "font.family": _FONT_FAMILY,
    "axes.unicode_minus": False,
    "figure.dpi": 100,
    "figure.facecolor": "#ffffff",
    "axes.facecolor": "#fafafa",
    "axes.grid": True,
    "grid.alpha": 0.3,
})

# ── Safe math expression evaluator (no eval()) ──────────────────────────────

_SAFE_NUMPY_FUNCS = {
    "sin": np.sin, "cos": np.cos, "tan": np.tan,
    "exp": np.exp, "log": np.log, "sqrt": np.sqrt,
    "abs": np.abs, "arcsin": np.arcsin, "arccos": np.arccos,
    "arctan": np.arctan, "sinh": np.sinh, "cosh": np.cosh,
    "tanh": np.tanh, "log10": np.log10, "log2": np.log2,
    "sign": np.sign, "ceil": np.ceil, "floor": np.floor,
}

_SAFE_CONSTANTS = {
    "pi": np.pi, "e": np.e, "inf": np.inf,
}

_SAFE_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _safe_eval_expr(node, variables: dict):
    """Recursively evaluate an AST node using only safe numeric operations."""
    if isinstance(node, ast.Expression):
        return _safe_eval_expr(node.body, variables)
    elif isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError(f"Unsupported constant type: {type(node.value)}")
    elif isinstance(node, ast.Name):
        name = node.id
        if name in variables:
            return variables[name]
        if name in _SAFE_CONSTANTS:
            return _SAFE_CONSTANTS[name]
        raise ValueError(f"Unknown variable: {name}")
    elif isinstance(node, ast.BinOp):
        op = type(node.op)
        if op not in _SAFE_OPS:
            raise ValueError(f"Unsupported operator: {op.__name__}")
        left = _safe_eval_expr(node.left, variables)
        right = _safe_eval_expr(node.right, variables)
        return _SAFE_OPS[op](left, right)
    elif isinstance(node, ast.UnaryOp):
        op = type(node.op)
        if op not in _SAFE_OPS:
            raise ValueError(f"Unsupported unary operator: {op.__name__}")
        operand = _safe_eval_expr(node.operand, variables)
        return _SAFE_OPS[op](operand)
    elif isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError("Only simple function calls allowed")
        func_name = node.func.id
        if func_name not in _SAFE_NUMPY_FUNCS:
            raise ValueError(f"Unknown function: {func_name}")
        args = [_safe_eval_expr(arg, variables) for arg in node.args]
        return _SAFE_NUMPY_FUNCS[func_name](*args)
    else:
        raise ValueError(f"Unsupported expression node: {type(node).__name__}")


def safe_math_eval(expr: str, variables: dict):
    """
    Safely evaluate a math expression string using AST parsing.
    Only allows numeric operations, numpy math functions, and named variables.
    No access to builtins, attributes, subscripts, or imports.
    """
    tree = ast.parse(expr, mode="eval")
    return _safe_eval_expr(tree, variables)


def render_chart(spec: Dict[str, Any]) -> Optional[str]:
    """
    Render a chart specification to a base64-encoded PNG data URI.

    Args:
        spec: Chart specification dict with keys:
            - type: "line", "bar", "scatter", "area", "function"
            - title: Chart title
            - x_label: X-axis label
            - y_label: Y-axis label
            - data_series: List of {name, x, y} or {name, expression, x_range}
            - annotations: Optional list of {text, x, y} or {type: "hline"/"vline", value, label}
            - style: Optional dict with colors, line styles, etc.

    Returns:
        Base64 data URI string, or None on failure.
    """
    try:
        chart_type = spec.get("type", "line")
        fig, ax = plt.subplots(figsize=(8, 5))

        if chart_type == "function":
            _render_function_chart(ax, spec)
        elif chart_type == "bar":
            _render_bar_chart(ax, spec)
        elif chart_type == "scatter":
            _render_scatter_chart(ax, spec)
        elif chart_type == "area":
            _render_area_chart(ax, spec)
        else:
            _render_line_chart(ax, spec)

        # Common styling
        ax.set_title(spec.get("title", ""), fontsize=14, fontweight="bold", pad=12)
        ax.set_xlabel(spec.get("x_label", ""), fontsize=11)
        ax.set_ylabel(spec.get("y_label", ""), fontsize=11)

        # Annotations
        for ann in spec.get("annotations", []):
            _add_annotation(ax, ann)

        if any(s.get("name") for s in spec.get("data_series", [])):
            ax.legend(fontsize=9, loc="best")

        plt.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode("utf-8")
        return f"data:image/png;base64,{b64}"

    except Exception as e:
        logger.error(f"Chart rendering failed: {e}")
        plt.close("all")
        return None


def _render_line_chart(ax, spec: Dict[str, Any]):
    colors = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6"]
    for i, series in enumerate(spec.get("data_series", [])):
        x = series.get("x", [])
        y = series.get("y", [])
        if not x or not y:
            continue
        style = series.get("style", {})
        ax.plot(
            x, y,
            label=series.get("name", ""),
            color=style.get("color", colors[i % len(colors)]),
            linewidth=style.get("linewidth", 2),
            linestyle=style.get("linestyle", "-"),
        )


def _render_function_chart(ax, spec: Dict[str, Any]):
    """Render mathematical function expressions (e.g., 'v_t * (1 - exp(-t/tau))')."""
    colors = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6"]
    for i, series in enumerate(spec.get("data_series", [])):
        expr = series.get("expression", "")
        x_range = series.get("x_range", [0, 10])
        n_points = series.get("n_points", 200)

        x = np.linspace(x_range[0], x_range[1], n_points)
        try:
            # Safe AST-based evaluation — no eval()
            variables = {"x": x, "t": x}
            for k, v in series.get("parameters", {}).items():
                variables[k] = v

            y = safe_math_eval(expr, variables)
        except Exception as e:
            logger.warning(f"Failed to evaluate expression '{expr}': {e}")
            continue

        style = series.get("style", {})
        ax.plot(
            x, y,
            label=series.get("name", ""),
            color=style.get("color", colors[i % len(colors)]),
            linewidth=style.get("linewidth", 2),
            linestyle=style.get("linestyle", "-"),
        )


def _render_bar_chart(ax, spec: Dict[str, Any]):
    colors = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6"]
    series_list = spec.get("data_series", [])
    n_series = len(series_list)
    if not series_list:
        return
    width = 0.8 / max(n_series, 1)
    for i, series in enumerate(series_list):
        x = np.arange(len(series.get("x", [])))
        offset = (i - n_series / 2 + 0.5) * width
        ax.bar(
            x + offset,
            series.get("y", []),
            width=width,
            label=series.get("name", ""),
            color=colors[i % len(colors)],
            alpha=0.85,
        )
    if series_list:
        ax.set_xticks(np.arange(len(series_list[0].get("x", []))))
        ax.set_xticklabels(series_list[0].get("x", []), rotation=30, ha="right")


def _render_scatter_chart(ax, spec: Dict[str, Any]):
    colors = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6"]
    for i, series in enumerate(spec.get("data_series", [])):
        ax.scatter(
            series.get("x", []),
            series.get("y", []),
            label=series.get("name", ""),
            color=colors[i % len(colors)],
            alpha=0.7,
            s=50,
        )


def _render_area_chart(ax, spec: Dict[str, Any]):
    colors = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6"]
    for i, series in enumerate(spec.get("data_series", [])):
        x = series.get("x", [])
        y = series.get("y", [])
        color = colors[i % len(colors)]
        ax.plot(x, y, label=series.get("name", ""), color=color, linewidth=2)
        ax.fill_between(x, y, alpha=0.15, color=color)


def _add_annotation(ax, ann: Dict[str, Any]):
    ann_type = ann.get("type", "text")
    if ann_type == "hline":
        ax.axhline(
            y=ann.get("value", 0),
            color=ann.get("color", "#888"),
            linestyle=ann.get("linestyle", "--"),
            linewidth=1.5,
            alpha=0.7,
        )
        if ann.get("label"):
            ax.text(
                ax.get_xlim()[1] * 0.95, ann["value"],
                ann["label"],
                ha="right", va="bottom", fontsize=9,
                color=ann.get("color", "#888"),
            )
    elif ann_type == "vline":
        ax.axvline(
            x=ann.get("value", 0),
            color=ann.get("color", "#888"),
            linestyle=ann.get("linestyle", "--"),
            linewidth=1.5,
            alpha=0.7,
        )
        if ann.get("label"):
            ax.text(
                ann["value"], ax.get_ylim()[1] * 0.95,
                ann["label"],
                ha="left", va="top", fontsize=9, rotation=90,
                color=ann.get("color", "#888"),
            )
    else:
        # Text annotation with arrow
        ax.annotate(
            ann.get("text", ""),
            xy=(ann.get("x", 0), ann.get("y", 0)),
            xytext=(ann.get("text_x", ann.get("x", 0) + 1), ann.get("text_y", ann.get("y", 0) + 1)),
            fontsize=9,
            arrowprops=dict(arrowstyle="->", color="#555"),
            bbox=dict(boxstyle="round,pad=0.3", facecolor="#fffde7", edgecolor="#ccc"),
        )


def extract_and_render_charts(text: str) -> str:
    """
    Find ```chart ... ``` blocks in content text, render each to an image,
    and replace the block with an image marker.

    Returns the modified text with chart blocks replaced by
    [CHART_IMAGE:data:image/png;base64,...] markers.
    """
    pattern = r"```chart\s*\n(.*?)\n\s*```"

    def replace_chart(match):
        try:
            spec = json.loads(match.group(1))
            data_uri = render_chart(spec)
            if data_uri:
                title = spec.get("title", "Chart")
                return f"[CHART_IMAGE:{title}:{data_uri}]"
            else:
                return match.group(0)  # Keep original if rendering fails
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"Failed to parse/render chart block: {e}")
            return match.group(0)

    return re.sub(pattern, replace_chart, text, flags=re.DOTALL)


def process_study_guide_sections(sections: list) -> list:
    """
    Process study guide sections, rendering any ```chart``` blocks
    in section content into base64 images.
    """
    for section in sections:
        content = section.get("content", "")
        if "```chart" in content:
            section["content"] = extract_and_render_charts(content)
    return sections
