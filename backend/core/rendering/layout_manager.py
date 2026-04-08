"""
Advanced Layout Manager for Educational Video Content
Provides precise pixel positioning and structured content organization
"""

from typing import Dict, List, Any, Tuple, Optional
from enum import Enum
import re


class LayoutZone(Enum):
    """Screen zones for content positioning"""
    TOP_LEFT = "top_left"
    TOP_CENTER = "top_center"
    TOP_RIGHT = "top_right"
    CENTER_LEFT = "center_left"
    CENTER = "center"
    CENTER_RIGHT = "center_right"
    BOTTOM_LEFT = "bottom_left"
    BOTTOM_CENTER = "bottom_center"
    BOTTOM_RIGHT = "bottom_right"


class ContentType(Enum):
    """Types of educational content"""
    TITLE = "title"
    PROBLEM = "problem"
    SOLUTION = "solution"
    EXPLANATION = "explanation"
    FORMULA = "formula"
    DIAGRAM = "diagram"
    IMAGE = "image"
    BULLET_POINT = "bullet_point"
    STEP = "step"


class EducationalLayoutManager:
    """
    Manages precise pixel positioning and structured layout
    for educational content following teaching principles
    """
    
    def __init__(self, canvas_width: int = 1920, canvas_height: int = 1080):
        self.canvas_width = canvas_width
        self.canvas_height = canvas_height
        
        # Define precise pixel zones
        self.zones = self._define_pixel_zones()
        
        # Content spacing rules
        self.spacing = {
            "line_height": 60,
            "paragraph_spacing": 40,
            "section_spacing": 80,
            "margin_horizontal": 100,
            "margin_vertical": 80
        }
    
    def _define_pixel_zones(self) -> Dict[LayoutZone, Dict[str, int]]:
        """Define precise pixel coordinates for each layout zone"""
        margin_x = 100
        margin_y = 80
        
        # Calculate zone boundaries
        left_x = margin_x
        center_x = self.canvas_width // 2
        right_x = self.canvas_width - margin_x
        
        top_y = margin_y
        center_y = self.canvas_height // 2
        bottom_y = self.canvas_height - margin_y
        
        return {
            LayoutZone.TOP_LEFT: {"x": left_x, "y": top_y, "anchor": "TOP_LEFT"},
            LayoutZone.TOP_CENTER: {"x": center_x, "y": top_y, "anchor": "TOP"},
            LayoutZone.TOP_RIGHT: {"x": right_x, "y": top_y, "anchor": "TOP_RIGHT"},
            
            LayoutZone.CENTER_LEFT: {"x": left_x, "y": center_y, "anchor": "LEFT"},
            LayoutZone.CENTER: {"x": center_x, "y": center_y, "anchor": "CENTER"},
            LayoutZone.CENTER_RIGHT: {"x": right_x, "y": center_y, "anchor": "RIGHT"},
            
            LayoutZone.BOTTOM_LEFT: {"x": left_x, "y": bottom_y, "anchor": "BOTTOM_LEFT"},
            LayoutZone.BOTTOM_CENTER: {"x": center_x, "y": bottom_y, "anchor": "BOTTOM"},
            LayoutZone.BOTTOM_RIGHT: {"x": right_x, "y": bottom_y, "anchor": "BOTTOM_RIGHT"}
        }
    
    def create_structured_layout(self, content: str, content_type: ContentType) -> Dict[str, Any]:
        """
        Create structured layout for different content types
        following educational design principles
        """
        if content_type == ContentType.PROBLEM:
            return self._layout_problem_solution_structure(content)
        elif content_type == ContentType.TITLE:
            return self._layout_title(content)
        elif content_type == ContentType.EXPLANATION:
            return self._layout_explanation(content)
        elif content_type == ContentType.FORMULA:
            return self._layout_formula(content)
        else:
            return self._layout_default(content)
    
    def _layout_problem_solution_structure(self, content: str) -> Dict[str, Any]:
        """
        Layout problem-solution structure:
        Problem (top)
        Blank space
        Solutions (middle, vertically stacked)
        """
        # Parse content to identify problem and solutions
        parts = self._parse_problem_solutions(content)
        
        layout_elements = []
        
        # Problem at top center
        if parts["problem"]:
            problem_zone = self.zones[LayoutZone.TOP_CENTER]
            layout_elements.append({
                "type": "problem",
                "content": parts["problem"],
                "position": {"x": problem_zone["x"], "y": problem_zone["y"]},
                "anchor": problem_zone["anchor"],
                "font_size": 42,
                "color": "#FF6B6B",  # Red for problems/questions
                "style": "bold"
            })
        
        # Solutions in center, vertically stacked
        if parts["solutions"]:
            center_y = self.canvas_height // 2
            solution_start_y = center_y - (len(parts["solutions"]) * 30)
            
            for i, solution in enumerate(parts["solutions"]):
                y_pos = solution_start_y + (i * self.spacing["line_height"])
                
                layout_elements.append({
                    "type": "solution",
                    "content": f"{i + 1}. {solution}",
                    "position": {"x": self.zones[LayoutZone.CENTER]["x"], "y": y_pos},
                    "anchor": "CENTER",
                    "font_size": 36,
                    "color": "#4ECDC4",  # Teal for solutions
                    "style": "normal"
                })
        
        return {
            "layout_type": "problem_solution",
            "elements": layout_elements,
            "spacing_applied": True
        }
    
    def _layout_title(self, content: str) -> Dict[str, Any]:
        """Layout title content prominently at top center"""
        title_zone = self.zones[LayoutZone.TOP_CENTER]
        
        return {
            "layout_type": "title",
            "elements": [{
                "type": "title",
                "content": content,
                "position": {"x": title_zone["x"], "y": title_zone["y"]},
                "anchor": title_zone["anchor"],
                "font_size": 56,
                "color": "#6366F1",  # Purple for titles
                "style": "bold"
            }]
        }
    
    def _layout_explanation(self, content: str) -> Dict[str, Any]:
        """Layout explanation with proper line breaks and spacing"""
        # Break content into manageable chunks
        chunks = self._break_into_visual_chunks(content, max_chars_per_line=50)
        
        layout_elements = []
        center_x = self.zones[LayoutZone.CENTER]["x"]
        
        # Start slightly above center for better visual balance
        start_y = (self.canvas_height // 2) - (len(chunks) * 20)
        
        for i, chunk in enumerate(chunks):
            y_pos = start_y + (i * self.spacing["line_height"])
            
            layout_elements.append({
                "type": "explanation",
                "content": chunk,
                "position": {"x": center_x, "y": y_pos},
                "anchor": "CENTER",
                "font_size": 32,
                "color": "#64748B",  # Gray for explanations
                "style": "normal"
            })
        
        return {
            "layout_type": "explanation",
            "elements": layout_elements
        }
    
    def _layout_formula(self, content: str) -> Dict[str, Any]:
        """Layout mathematical formulas with proper spacing"""
        # Clean up formula content
        clean_formula = self._clean_latex_formula(content)
        
        formula_zone = self.zones[LayoutZone.CENTER]
        
        return {
            "layout_type": "formula",
            "elements": [{
                "type": "formula",
                "content": clean_formula,
                "position": {"x": formula_zone["x"], "y": formula_zone["y"]},
                "anchor": formula_zone["anchor"],
                "font_size": 44,
                "color": "#8B5CF6",  # Purple for math
                "style": "math",
                "is_latex": True
            }]
        }
    
    def _layout_default(self, content: str) -> Dict[str, Any]:
        """Default centered layout for general content"""
        center_zone = self.zones[LayoutZone.CENTER]
        
        return {
            "layout_type": "default",
            "elements": [{
                "type": "content",
                "content": content,
                "position": {"x": center_zone["x"], "y": center_zone["y"]},
                "anchor": center_zone["anchor"],
                "font_size": 36,
                "color": "#1F2937",  # Dark gray for general content
                "style": "normal"
            }]
        }
    
    def _parse_problem_solutions(self, content: str) -> Dict[str, Any]:
        """Parse content to identify problem statement and solutions"""
        lines = [line.strip() for line in content.split('\n') if line.strip()]
        
        problem = ""
        solutions = []
        
        # Look for question markers
        question_markers = ["?", "What", "How", "Why", "When", "Where", "Which", "Problem:"]
        solution_markers = ["1.", "2.", "3.", "•", "-", "Solution:", "Answer:"]
        
        current_mode = "problem"
        
        for line in lines:
            if any(marker in line for marker in question_markers) and current_mode == "problem":
                problem = line
            elif any(line.startswith(marker) for marker in solution_markers):
                current_mode = "solution"
                # Clean solution marker
                clean_solution = re.sub(r'^[1-3]\.\s*|^[•-]\s*|^Solution:\s*|^Answer:\s*', '', line)
                solutions.append(clean_solution)
            elif current_mode == "solution" and line:
                solutions.append(line)
        
        # If no clear structure found, treat first line as problem, rest as solutions
        if not problem and not solutions and lines:
            problem = lines[0]
            solutions = lines[1:] if len(lines) > 1 else []
        
        return {
            "problem": problem,
            "solutions": solutions
        }
    
    def _break_into_visual_chunks(self, content: str, max_chars_per_line: int = 50) -> List[str]:
        """Break content into visually appropriate chunks"""
        words = content.split()
        chunks = []
        current_chunk = ""
        
        for word in words:
            test_chunk = current_chunk + (" " if current_chunk else "") + word
            
            if len(test_chunk) <= max_chars_per_line:
                current_chunk = test_chunk
            else:
                if current_chunk:
                    chunks.append(current_chunk)
                current_chunk = word
        
        if current_chunk:
            chunks.append(current_chunk)
        
        return chunks
    
    def _clean_latex_formula(self, formula: str) -> str:
        """Clean and validate LaTeX formula syntax"""
        # Remove common problematic patterns
        formula = re.sub(r'\\begin\{[^}]+\}|\\end\{[^}]+\}', '', formula)
        formula = re.sub(r'\\label\{[^}]*\}', '', formula)
        formula = re.sub(r'\\tag\{[^}]*\}', '', formula)
        
        # Fix common syntax issues
        formula = formula.replace('**', '^')
        formula = re.sub(r'\s+', ' ', formula).strip()
        
        return formula
    
    def get_zone_coordinates(self, zone: LayoutZone) -> Tuple[int, int]:
        """Get pixel coordinates for a specific zone"""
        zone_data = self.zones[zone]
        return (zone_data["x"], zone_data["y"])
    
    def generate_manim_position_code(self, layout_data: Dict[str, Any]) -> str:
        """Generate Manim code for the positioned layout"""
        code_lines = []
        
        for i, element in enumerate(layout_data["elements"]):
            var_name = f"element_{i}"
            content = element["content"]
            pos_x = element["position"]["x"]
            pos_y = element["position"]["y"]
            font_size = element["font_size"]
            color = element["color"]
            
            # Convert screen coordinates to Manim coordinates
            manim_x = (pos_x - self.canvas_width/2) / 100  # Scale to Manim units
            manim_y = (self.canvas_height/2 - pos_y) / 100  # Flip Y and scale
            
            if element.get("is_latex"):
                code_lines.append(f'{var_name} = MathTex("{content}", font_size={font_size}, color="{color}")')
            else:
                code_lines.append(f'{var_name} = Text("{content}", font_size={font_size}, color="{color}")')
            
            code_lines.append(f'{var_name}.move_to([{manim_x:.2f}, {manim_y:.2f}, 0])')
            code_lines.append(f'self.add({var_name})')
            code_lines.append('')
        
        return '\n'.join(code_lines)


# Integration functions
def create_educational_layout(content: str, scene_type: str = "general") -> Dict[str, Any]:
    """
    Create educational layout based on content type
    """
    layout_manager = EducationalLayoutManager()
    
    # Determine content type
    if "?" in content or any(word in content.lower() for word in ["problem", "solve", "find"]):
        content_type = ContentType.PROBLEM
    elif any(word in content.lower() for word in ["title", "lesson", "chapter"]):
        content_type = ContentType.TITLE
    elif any(symbol in content for symbol in ["=", "+", "-", "^", "∫", "∑"]):
        content_type = ContentType.FORMULA
    else:
        content_type = ContentType.EXPLANATION
    
    return layout_manager.create_structured_layout(content, content_type)


def generate_positioned_manim_code(content: str, scene_type: str = "general") -> str:
    """
    Generate Manim code with precise positioning
    """
    layout_manager = EducationalLayoutManager()
    layout_data = create_educational_layout(content, scene_type)
    
    return layout_manager.generate_manim_position_code(layout_data)


if __name__ == "__main__":
    # Test the layout manager
    test_content = """
    What are the three main types of chemical bonds?
    1. Ionic bonds - between metals and non-metals
    2. Covalent bonds - between non-metals
    3. Metallic bonds - between metals
    """
    
    layout = create_educational_layout(test_content)
    print("Layout structure:")
    for element in layout["elements"]:
        print(f"  {element['type']}: {element['content'][:50]}...")
        print(f"    Position: ({element['position']['x']}, {element['position']['y']})")