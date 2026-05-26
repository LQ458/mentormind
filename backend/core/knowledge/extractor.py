"""
Extract concepts and relationships from a lesson into the user's
personal knowledge graph.

Triggered after every successful lesson save (best-effort, never blocks
the lesson save itself). Output is upserted into kg_concepts and
kg_relationships, keyed by (user_id, normalized_name, language).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import select, func

import networkx as nx

from database.base import SessionLocal
from database.models.knowledge_graph import KGConcept, KGRelationship
from services.api_client import DeepSeekClient

logger = logging.getLogger(__name__)


# ── Normalization ──────────────────────────────────────────────────────────────

_PUNCT_RE = re.compile(r"[\s\-_/.,;:!?()\[\]{}'\"`~+*=<>@#$%^&|\\]+")


def _normalize(name: str) -> str:
    """Lowercase + strip punctuation/whitespace so 'Big-O Notation' and
    'big o notation' collapse into the same node."""
    if not name:
        return ""
    s = name.strip().lower()
    s = _PUNCT_RE.sub("", s)
    return s[:200]


# ── LLM extraction ────────────────────────────────────────────────────────────

_PROMPT = """You are a knowledge-graph extraction agent for a learning platform.

Given the title, learning objectives, and short content of a lesson, extract:
1. Up to 8 distinct CONCEPTS the lesson teaches.
2. Up to 12 RELATIONSHIPS between those concepts.

Return STRICT JSON with this shape (no markdown, no commentary):
{{
  "concepts": [
    {{"name": "<short concept name, ≤ 5 words>",
      "level": "beginner" | "intermediate" | "advanced",
      "summary": "<one sentence in {language}>"}}
  ],
  "relationships": [
    {{"from": "<concept name>",
      "to": "<concept name>",
      "kind": "prerequisite" | "contains" | "related_to" | "example_of" | "contrasts",
      "weight": <0.0..1.0>}}
  ]
}}

Rules:
- Concept names should be domain terms a student would recognize, not full sentences.
- Both ends of every relationship MUST appear in `concepts`.
- Use `prerequisite` only when one concept is genuinely required to understand the other.
- Output language for `summary` and `name` matches the lesson language ({language}).

LESSON
- Title: {title}
- Subject: {subject}
- Objectives: {objectives}
- Content excerpt: {content_excerpt}
"""


_JSON_BLOCK_RE = re.compile(r"\{[\s\S]*\}")


def _coerce_objectives(objectives: Iterable[Any]) -> List[str]:
    out: List[str] = []
    for obj in objectives or []:
        if isinstance(obj, dict):
            text = obj.get("objective") or obj.get("title") or obj.get("description")
            if text:
                out.append(str(text))
        elif obj:
            out.append(str(obj))
    return out[:8]


async def _call_llm(
    title: str,
    subject: str,
    objectives: List[str],
    content_excerpt: str,
    language: str,
) -> Optional[Dict[str, Any]]:
    try:
        client = DeepSeekClient()
    except Exception as exc:
        logger.warning("[kg] DeepSeek client unavailable: %s", exc)
        return None

    prompt = _PROMPT.format(
        language="Chinese" if language == "zh" else "English",
        title=title or "(untitled)",
        subject=subject or "(unspecified)",
        objectives="; ".join(objectives) if objectives else "(none)",
        content_excerpt=content_excerpt[:1200] if content_excerpt else "(empty)",
    )
    messages = [
        {"role": "system", "content": "You output strict JSON only. No prose, no markdown."},
        {"role": "user", "content": prompt},
    ]

    try:
        resp = await client.chat_completion(messages=messages, temperature=0.2, max_tokens=1500)
    except Exception as exc:
        logger.warning("[kg] LLM call failed: %s", exc)
        return None

    if not getattr(resp, "success", False) or not getattr(resp, "data", None):
        logger.info("[kg] LLM call unsuccessful")
        return None

    raw_content = ""
    try:
        raw_content = resp.data["choices"][0]["message"]["content"]
    except Exception:
        logger.info("[kg] unexpected LLM response shape")
        return None

    # Strip markdown code fences if present
    raw_content = raw_content.strip()
    if raw_content.startswith("```"):
        raw_content = raw_content.strip("`")
        # remove leading "json\n"
        if raw_content.lower().startswith("json"):
            raw_content = raw_content[4:].lstrip()

    try:
        parsed = json.loads(raw_content)
    except json.JSONDecodeError:
        match = _JSON_BLOCK_RE.search(raw_content)
        if not match:
            logger.info("[kg] no JSON in LLM output")
            return None
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            logger.info("[kg] JSON parse failed: %s", exc)
            return None

    if not isinstance(parsed, dict):
        return None
    return parsed


# ── DB upsert ─────────────────────────────────────────────────────────────────

_VALID_LEVELS = {"beginner", "intermediate", "advanced"}
_VALID_KINDS = {"prerequisite", "contains", "related_to", "example_of", "contrasts"}


def _upsert_concept(
    db: Session,
    user_id: str,
    language: str,
    raw: Dict[str, Any],
    subject: Optional[str],
    lesson_id: Optional[str],
) -> Optional[KGConcept]:
    name = (raw.get("name") or "").strip()
    if not name:
        return None
    norm = _normalize(name)
    if not norm:
        return None
    level = raw.get("level") if raw.get("level") in _VALID_LEVELS else None
    summary = (raw.get("summary") or "").strip() or None

    existing = db.execute(
        select(KGConcept).where(
            KGConcept.user_id == user_id,
            KGConcept.normalized_name == norm,
            KGConcept.language == language,
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.lesson_count = (existing.lesson_count or 0) + 1
        if not existing.summary and summary:
            existing.summary = summary
        if not existing.level and level:
            existing.level = level
        if not existing.subject and subject:
            existing.subject = subject
        return existing

    concept = KGConcept(
        user_id=user_id,
        name=name[:200],
        normalized_name=norm,
        language=language,
        level=level,
        subject=subject,
        summary=summary,
        source_lesson_id=lesson_id,
        lesson_count=1.0,
    )
    db.add(concept)
    db.flush()
    return concept


def _upsert_relationship(
    db: Session,
    user_id: str,
    from_id,
    to_id,
    kind: str,
    weight: float,
    lesson_id: Optional[str],
) -> None:
    if from_id == to_id:
        return
    if kind not in _VALID_KINDS:
        kind = "related_to"
    weight = max(0.0, min(1.0, float(weight or 0.5)))

    existing = db.execute(
        select(KGRelationship).where(
            KGRelationship.user_id == user_id,
            KGRelationship.from_concept_id == from_id,
            KGRelationship.to_concept_id == to_id,
            KGRelationship.kind == kind,
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.weight = max(existing.weight or 0.0, weight)
        return

    edge = KGRelationship(
        user_id=user_id,
        from_concept_id=from_id,
        to_concept_id=to_id,
        kind=kind,
        weight=weight,
        source_lesson_id=lesson_id,
    )
    db.add(edge)


# ── Public API ────────────────────────────────────────────────────────────────


async def extract_for_lesson(
    *,
    user_id: Optional[str],
    lesson_id: Optional[str],
    title: Optional[str],
    objectives: Iterable[Any],
    content: Optional[str] = None,
    language: str = "en",
    subject: Optional[str] = None,
) -> Dict[str, int]:
    """Extract + persist KG nodes/edges for one lesson.

    Returns counts dict. Never raises — designed to be called best-effort
    from the lesson-save path."""
    if not user_id:
        return {"concepts": 0, "edges": 0, "skipped": 1}

    objs = _coerce_objectives(objectives)
    parsed = await _call_llm(
        title=title or "",
        subject=subject or "",
        objectives=objs,
        content_excerpt=(content or ""),
        language=language or "en",
    )
    if not parsed:
        return {"concepts": 0, "edges": 0, "skipped": 1}

    raw_concepts = parsed.get("concepts") or []
    raw_edges = parsed.get("relationships") or []
    if not isinstance(raw_concepts, list):
        return {"concepts": 0, "edges": 0, "skipped": 1}

    db: Session = SessionLocal()
    try:
        concept_by_norm: Dict[str, KGConcept] = {}
        for raw in raw_concepts[:8]:
            if not isinstance(raw, dict):
                continue
            concept = _upsert_concept(
                db=db,
                user_id=user_id,
                language=language or "en",
                raw=raw,
                subject=subject,
                lesson_id=lesson_id,
            )
            if concept is not None:
                concept_by_norm[concept.normalized_name] = concept

        edge_count = 0
        if isinstance(raw_edges, list):
            for raw in raw_edges[:12]:
                if not isinstance(raw, dict):
                    continue
                from_norm = _normalize(raw.get("from") or "")
                to_norm = _normalize(raw.get("to") or "")
                if not from_norm or not to_norm:
                    continue
                a = concept_by_norm.get(from_norm)
                b = concept_by_norm.get(to_norm)
                if not a or not b:
                    continue
                _upsert_relationship(
                    db=db,
                    user_id=user_id,
                    from_id=a.id,
                    to_id=b.id,
                    kind=str(raw.get("kind") or "related_to"),
                    weight=raw.get("weight", 0.5),
                    lesson_id=lesson_id,
                )
                edge_count += 1

        db.commit()
        return {"concepts": len(concept_by_norm), "edges": edge_count, "skipped": 0}
    except Exception as exc:
        logger.exception("[kg] persistence failed: %s", exc)
        db.rollback()
        return {"concepts": 0, "edges": 0, "skipped": 1}
    finally:
        db.close()


def extract_for_lesson_sync(**kwargs) -> Dict[str, int]:
    """Sync wrapper for use inside Celery tasks. Best-effort, never raises."""
    import asyncio
    try:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Already inside an event loop (rare in Celery solo pool but
                # possible). Use a dedicated loop in a thread.
                import threading
                result_holder: Dict[str, Any] = {}
                def _runner():
                    new_loop = asyncio.new_event_loop()
                    try:
                        asyncio.set_event_loop(new_loop)
                        result_holder["v"] = new_loop.run_until_complete(extract_for_lesson(**kwargs))
                    finally:
                        new_loop.close()
                t = threading.Thread(target=_runner, daemon=True)
                t.start()
                t.join(timeout=60)
                return result_holder.get("v", {"concepts": 0, "edges": 0, "skipped": 1})
        except RuntimeError:
            pass
        return asyncio.run(extract_for_lesson(**kwargs))
    except Exception as exc:
        logger.warning("[kg] sync wrapper failed: %s", exc)
        return {"concepts": 0, "edges": 0, "skipped": 1}


def get_user_graph(user_id: str, language: Optional[str] = None) -> Dict[str, Any]:
    """Fetch the user's full graph for the visualization endpoint."""
    db: Session = SessionLocal()
    try:
        q = select(KGConcept).where(KGConcept.user_id == user_id)
        if language:
            q = q.where(KGConcept.language == language)
        concepts = db.execute(q).scalars().all()

        eq = select(KGRelationship).where(KGRelationship.user_id == user_id)
        edges = db.execute(eq).scalars().all()
        node_ids = {str(c.id) for c in concepts}
        edges = [e for e in edges if str(e.from_concept_id) in node_ids and str(e.to_concept_id) in node_ids]

        nodes = [
            {
                "id": str(c.id),
                "name": c.name,
                "level": c.level,
                "subject": c.subject,
                "language": c.language,
                "summary": c.summary,
                "lesson_count": int(c.lesson_count or 1),
                "proficiency": _compute_proficiency(c.lesson_count or 1.0),
                "source_lesson_id": str(c.source_lesson_id) if c.source_lesson_id else None,
            }
            for c in concepts
        ]

        edge_list = [
            {
                "from": str(e.from_concept_id),
                "to": str(e.to_concept_id),
                "kind": e.kind,
                "weight": float(e.weight or 0.5),
                "source_lesson_id": str(e.source_lesson_id) if e.source_lesson_id else None,
            }
            for e in edges
        ]

        return {
            "nodes": nodes,
            "edges": edge_list,
            "learning_path": _compute_learning_path(nodes, edge_list),
        }
    finally:
        db.close()


def _compute_proficiency(lesson_count: float) -> float:
    """Crude proficiency heuristic: min(1.0, lesson_count / 5)."""
    lc = float(lesson_count or 0)
    if lc <= 0:
        return 0.0
    return round(min(1.0, lc / 5.0), 2)


def _compute_learning_path(
    nodes: list,
    edges: list,
    min_weight: float = 0.6,
    min_lesson_count: float = 2.0,
) -> list:
    """Topologically sorted learning path from prerequisite edges.

    Quality gates:
    - Only ``kind = prerequisite`` edges
    - Edge weight >= *min_weight*
    - Both nodes appear in >= *min_lesson_count* lessons
    - Both nodes share the same subject
    - Cycles are detected and broken by removing the lowest-weight edge
    """
    if not nodes or not edges:
        return []

    node_map = {n["id"]: n for n in nodes}
    g = nx.DiGraph()

    for n in nodes:
        if (n.get("lesson_count") or 1) < min_lesson_count:
            continue
        g.add_node(n["id"], **n)

    for e in edges:
        if e.get("kind") != "prerequisite":
            continue
        if (e.get("weight") or 0) < min_weight:
            continue
        a, b = e["from"], e["to"]
        if a not in g or b not in g:
            continue
        if node_map.get(a, {}).get("subject") != node_map.get(b, {}).get("subject"):
            continue
        g.add_edge(a, b, weight=e["weight"])

    if g.number_of_nodes() == 0:
        return []

    # If no qualifying prerequisite edges exist there is no learning path.
    if g.number_of_edges() == 0:
        return []

    # Break cycles by removing the lowest-weight edge in each simple cycle.
    try:
        order = list(nx.topological_sort(g))
    except nx.NetworkXUnfeasible:
        try:
            for cycle in list(nx.simple_cycles(g)):
                if len(cycle) <= 1:
                    continue
                min_edge = None
                min_w = float("inf")
                for i in range(len(cycle)):
                    u, v = cycle[i], cycle[(i + 1) % len(cycle)]
                    if g.has_edge(u, v):
                        w = g.edges[u, v].get("weight", 0.5)
                        if w < min_w:
                            min_w = w
                            min_edge = (u, v)
                if min_edge:
                    g.remove_edge(*min_edge)
            order = list(nx.topological_sort(g))
        except nx.NetworkXUnfeasible:
            order = [nid for nid in g.nodes() if g.degree(nid) > 0]

    return [
        {
            "id": nid,
            "name": node_map.get(nid, {}).get("name", nid),
            "proficiency": _compute_proficiency(node_map.get(nid, {}).get("lesson_count", 1)),
            "order_index": i,
        }
        for i, nid in enumerate(order)
    ]
