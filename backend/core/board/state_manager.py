from __future__ import annotations

import time
import uuid
import logging
from typing import Any, Dict, List, Optional

from core.board.models import (
    BackgroundStyle,
    BoardElement,
    BoardElementFactory,
    BoardEvent,
    BoardLayout,
    BoardState,
    ColorStyle,
    ElementState,
    ElementStyle,
    ElementType,
    AnimationType,
    NarrationSegment,
    Position,
    SizeStyle,
)

logger = logging.getLogger(__name__)

MAX_ELEMENTS = 200
MAX_EVENT_LOG = 500
MAX_NARRATION_QUEUE = 100


class BoardStateManager:
    """Manages board state transitions and maintains an ordered event log."""

    def __init__(self) -> None:
        self._state: Optional[BoardState] = None

    @property
    def state(self) -> Optional[BoardState]:
        return self._state

    def _emit(self, event_type: str, element_id: Optional[str] = None, **data: Any) -> BoardEvent:
        event = BoardEvent(
            event_type=event_type,
            timestamp=time.time(),
            element_id=element_id,
            data=data,
        )
        if self._state is not None:
            self._state.event_log.append(event)
            if len(self._state.event_log) > MAX_EVENT_LOG:
                self._state.event_log = self._state.event_log[-MAX_EVENT_LOG:]
        return event

    def _append_narration(self, text: str, element_id: Optional[str] = None) -> None:
        if self._state is None:
            return
        self._state.narration_queue.append(
            NarrationSegment(text=text, element_id=element_id)
        )
        if len(self._state.narration_queue) > MAX_NARRATION_QUEUE:
            self._state.narration_queue = self._state.narration_queue[-MAX_NARRATION_QUEUE:]

    def emit_comprehension_check(
        self,
        element_id: Optional[str] = None,
        question: Optional[str] = None,
        options: Optional[List[str]] = None,
        segment_summary: Optional[str] = None,
    ) -> BoardEvent:
        return self._emit(
            "comprehension_check",
            element_id=element_id,
            question=question,
            options=options or [],
            segment_summary=segment_summary,
            allow_emoji=True,
        )

    def create_board(
        self,
        title: str,
        layout: str = "full_canvas",
        background: str = "dark_board",
        topic: str = "",
    ) -> BoardEvent:
        board_id = str(uuid.uuid4())
        self._state = BoardState(
            board_id=board_id,
            title=title,
            layout=BoardLayout(layout),
            background=BackgroundStyle(background),
        )
        return self._emit(
            "board_created",
            board_id=board_id,
            title=title,
            layout=layout,
            background=background,
            topic=topic,
        )

    def add_element(
        self,
        element_type: str,
        content: str,
        position: Optional[Dict[str, Any]] = None,
        style: Optional[Dict[str, Any]] = None,
        narration: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> BoardEvent:
        if self._state is None:
            raise RuntimeError("Board not created. Call create_board first.")

        if len(self._state.elements) >= MAX_ELEMENTS:
            raise ValueError(f"Maximum element count ({MAX_ELEMENTS}) reached.")

        et = ElementType(element_type)

        pos = Position(
            region=(position or {}).get("region", "center"),
            offset_x=(position or {}).get("offset_x", 0),
            offset_y=(position or {}).get("offset_y", 0),
        )

        es = ElementStyle(
            color=ColorStyle((style or {}).get("color", "text")),
            size=SizeStyle((style or {}).get("size", "medium")),
            animation=AnimationType((style or {}).get("animation", "write")),
        )

        element = BoardElementFactory.create(
            element_type=et,
            content=content,
            position=pos,
            style=es,
            metadata=metadata or {},
        )

        self._state.elements[element.element_id] = element
        self._state.current_focus = element.element_id

        if narration:
            self._append_narration(narration, element.element_id)

        return self._emit(
            "element_added",
            element_id=element.element_id,
            element_type=element_type,
            content=content,
            position=pos.__dict__,
            style={"color": es.color.value, "size": es.size.value, "animation": es.animation.value},
            narration=narration,
            metadata=metadata or {},
        )

    def update_element(
        self,
        element_id: str,
        action: str,
        new_content: Optional[str] = None,
        narration: Optional[str] = None,
    ) -> BoardEvent:
        if self._state is None:
            raise RuntimeError("Board not created.")

        if element_id not in self._state.elements:
            raise KeyError(f"Element '{element_id}' not found on board.")

        element = self._state.elements[element_id]

        if action == "highlight":
            element.state = ElementState.highlighted
            self._state.current_focus = element_id
        elif action == "dim":
            element.state = ElementState.visible
        elif action == "update_content":
            if new_content is not None:
                element.content = new_content
        elif action == "move":
            pass  # Position update would come from metadata; keeping simple for now
        elif action == "animate_transform":
            if new_content is not None:
                element.content = new_content
            element.state = ElementState.entering
        elif action == "remove":
            del self._state.elements[element_id]
            if self._state.current_focus == element_id:
                self._state.current_focus = None
        else:
            raise ValueError(f"Unknown action: {action}")

        if narration and action != "remove":
            self._append_narration(narration, element_id)

        return self._emit(
            "element_updated",
            element_id=element_id,
            action=action,
            new_content=new_content,
            narration=narration,
        )

    def clear(
        self,
        scope: str = "all",
        region: Optional[str] = None,
        animation: str = "fade_out",
        narration: Optional[str] = None,
    ) -> BoardEvent:
        if self._state is None:
            raise RuntimeError("Board not created.")

        removed_ids: List[str] = []

        if scope == "all":
            removed_ids = list(self._state.elements.keys())
            self._state.elements.clear()
            self._state.current_focus = None
        elif scope == "except_title":
            to_remove = [
                eid for eid, el in self._state.elements.items()
                if el.element_type != ElementType.title
            ]
            for eid in to_remove:
                del self._state.elements[eid]
            removed_ids = to_remove
            if self._state.current_focus in to_remove:
                self._state.current_focus = None
        elif scope == "region" and region:
            to_remove = [
                eid for eid, el in self._state.elements.items()
                if el.position.region == region
            ]
            for eid in to_remove:
                del self._state.elements[eid]
            removed_ids = to_remove
            if self._state.current_focus in to_remove:
                self._state.current_focus = None

        if narration:
            self._append_narration(narration)

        return self._emit(
            "board_cleared",
            scope=scope,
            region=region,
            animation=animation,
            removed_ids=removed_ids,
            narration=narration,
        )

    def set_layout(
        self,
        layout: str,
        transition: str = "smooth",
    ) -> BoardEvent:
        if self._state is None:
            raise RuntimeError("Board not created.")

        self._state.layout = BoardLayout(layout)

        return self._emit(
            "layout_changed",
            layout=layout,
            transition=transition,
        )

    def add_narration(
        self,
        text: str,
        pause_after_ms: int = 500,
    ) -> BoardEvent:
        if self._state is None:
            raise RuntimeError("Board not created.")

        self._append_narration(text)

        return self._emit(
            "narration",
            narration_text=text,
            pause_after_ms=pause_after_ms,
        )

    def get_state(self) -> Optional[Dict[str, Any]]:
        if self._state is None:
            return None
        return self._state.to_dict()

    def get_event_log(self) -> List[Dict[str, Any]]:
        if self._state is None:
            return []
        return [ev.to_dict() for ev in self._state.event_log]
