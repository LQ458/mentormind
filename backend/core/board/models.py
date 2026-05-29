from __future__ import annotations

import uuid
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class ElementType(Enum):
    title = "title"
    text_block = "text_block"
    equation = "equation"
    graph = "graph"
    shape = "shape"
    transform = "transform"
    code_block = "code_block"
    image = "image"
    definition_box = "definition_box"
    theorem_box = "theorem_box"
    step_list = "step_list"
    arrow = "arrow"
    highlight = "highlight"
    table = "table"


class ElementState(Enum):
    hidden = "hidden"
    entering = "entering"
    visible = "visible"
    highlighted = "highlighted"
    exiting = "exiting"


class BoardLayout(Enum):
    full_canvas = "full_canvas"
    split_left_right = "split_left_right"
    split_top_bottom = "split_top_bottom"
    focus_center = "focus_center"


class BackgroundStyle(Enum):
    dark_board = "dark_board"
    light_board = "light_board"
    grid = "grid"
    plain = "plain"


class AnimationType(Enum):
    fade_in = "fade_in"
    write = "write"
    grow = "grow"
    slide_in = "slide_in"
    none = "none"


class ColorStyle(Enum):
    accent = "accent"
    heading = "heading"
    text = "text"
    green = "green"
    mauve = "mauve"
    yellow = "yellow"
    red = "red"


class SizeStyle(Enum):
    small = "small"
    medium = "medium"
    large = "large"
    xlarge = "xlarge"


@dataclass
class Position:
    region: str
    offset_x: float = 0
    offset_y: float = 0


@dataclass
class ElementStyle:
    color: ColorStyle = ColorStyle.text
    size: SizeStyle = SizeStyle.medium
    animation: AnimationType = AnimationType.write


@dataclass
class BoardElement:
    element_id: str
    element_type: ElementType
    content: str
    position: Position
    style: ElementStyle
    state: ElementState = ElementState.visible
    created_at: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class NarrationSegment:
    text: str
    element_id: Optional[str] = None
    audio_path: Optional[str] = None
    duration_ms: Optional[int] = None


@dataclass
class BoardEvent:
    event_type: str
    timestamp: float
    element_id: Optional[str] = None
    data: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "element_id": self.element_id,
            "data": self.data,
        }


@dataclass
class BoardState:
    board_id: str
    title: str
    layout: BoardLayout
    background: BackgroundStyle
    elements: Dict[str, BoardElement] = field(default_factory=dict)
    current_focus: Optional[str] = None
    narration_queue: List[NarrationSegment] = field(default_factory=list)
    event_log: List[BoardEvent] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "board_id": self.board_id,
            "title": self.title,
            "layout": self.layout.value,
            "background": self.background.value,
            "elements": {
                eid: {
                    "element_id": el.element_id,
                    "element_type": el.element_type.value,
                    "content": el.content,
                    "position": {
                        "region": el.position.region,
                        "offset_x": el.position.offset_x,
                        "offset_y": el.position.offset_y,
                    },
                    "style": {
                        "color": el.style.color.value,
                        "size": el.style.size.value,
                        "animation": el.style.animation.value,
                    },
                    "state": el.state.value,
                    "created_at": el.created_at,
                    "metadata": el.metadata,
                }
                for eid, el in self.elements.items()
            },
            "current_focus": self.current_focus,
            "narration_queue": [
                {
                    "text": seg.text,
                    "element_id": seg.element_id,
                    "audio_path": seg.audio_path,
                    "duration_ms": seg.duration_ms,
                }
                for seg in self.narration_queue
            ],
            "event_log": [ev.to_dict() for ev in self.event_log],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> BoardState:
        elements: Dict[str, BoardElement] = {}
        for eid, el_data in data.get("elements", {}).items():
            pos_data = el_data["position"]
            style_data = el_data["style"]
            elements[eid] = BoardElement(
                element_id=el_data["element_id"],
                element_type=ElementType(el_data["element_type"]),
                content=el_data["content"],
                position=Position(
                    region=pos_data["region"],
                    offset_x=pos_data.get("offset_x", 0),
                    offset_y=pos_data.get("offset_y", 0),
                ),
                style=ElementStyle(
                    color=ColorStyle(style_data.get("color", "text")),
                    size=SizeStyle(style_data.get("size", "medium")),
                    animation=AnimationType(style_data.get("animation", "write")),
                ),
                state=ElementState(el_data.get("state", "visible")),
                created_at=el_data.get("created_at", time.time()),
                metadata=el_data.get("metadata", {}),
            )

        narration_queue = [
            NarrationSegment(
                text=seg["text"],
                element_id=seg.get("element_id"),
                audio_path=seg.get("audio_path"),
                duration_ms=seg.get("duration_ms"),
            )
            for seg in data.get("narration_queue", [])
        ]

        event_log = [
            BoardEvent(
                event_type=ev["event_type"],
                timestamp=ev["timestamp"],
                element_id=ev.get("element_id"),
                data=ev.get("data", {}),
            )
            for ev in data.get("event_log", [])
        ]

        return cls(
            board_id=data["board_id"],
            title=data["title"],
            layout=BoardLayout(data["layout"]),
            background=BackgroundStyle(data["background"]),
            elements=elements,
            current_focus=data.get("current_focus"),
            narration_queue=narration_queue,
            event_log=event_log,
        )


class BoardElementFactory:
    @staticmethod
    def create(
        element_type: ElementType,
        content: str,
        position: Optional[Position] = None,
        style: Optional[ElementStyle] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> BoardElement:
        if not isinstance(element_type, ElementType):
            raise ValueError(f"Invalid element_type: {element_type!r}. Must be an ElementType enum value.")

        return BoardElement(
            element_id=str(uuid.uuid4()),
            element_type=element_type,
            content=content,
            position=position if position is not None else Position(region="main"),
            style=style if style is not None else ElementStyle(),
            created_at=time.time(),
            metadata=metadata if metadata is not None else {},
        )
