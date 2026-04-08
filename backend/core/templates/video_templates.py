"""
High-quality video templates for fast generation
"""

# Math-focused templates
MATH_TEMPLATES = {
    "calculus": {
        "title": "Introduction to Calculus",
        "scenes": [
            {
                "id": "scene_1",
                "duration": 25,
                "narration": "Calculus is the mathematics of change and motion. Today we'll discover why it's one of humanity's greatest intellectual achievements.",
                "action": "title_card",
                "param": "Calculus: The Mathematics of Change"
            },
            {
                "id": "scene_2", 
                "duration": 30,
                "narration": "Imagine you're driving a car. Your speedometer shows your speed at any instant, but how far have you traveled? This is the fundamental question calculus answers.",
                "action": "create_graph",
                "param": "speed vs time graph"
            },
            {
                "id": "scene_3",
                "duration": 35,
                "narration": "The derivative tells us the rate of change - like your car's acceleration. The integral tells us the total change - like the distance traveled.",
                "action": "split_screen",
                "param": "derivative on left, integral on right"
            }
        ]
    },
    
    "algebra": {
        "title": "Algebraic Thinking",
        "scenes": [
            {
                "id": "scene_1",
                "duration": 20,
                "narration": "Algebra is the language of patterns and relationships. Let's discover how it helps us solve real-world problems.",
                "action": "title_card", 
                "param": "Algebra: The Language of Patterns"
            },
            {
                "id": "scene_2",
                "duration": 30,
                "narration": "When we write x + 5 = 12, we're asking: what number plus 5 equals 12? This simple question opens up a world of mathematical reasoning.",
                "action": "write_equation",
                "param": "x + 5 = 12"
            }
        ]
    },
    
    "probability": {
        "title": "Probability Foundations",
        "scenes": [
            {
                "id": "scene_1",
                "duration": 25,
                "narration": "Probability helps us understand uncertainty and make decisions when we don't have complete information.",
                "action": "title_card",
                "param": "Probability: Understanding Uncertainty"
            },
            {
                "id": "scene_2",
                "duration": 30,
                "narration": "When you flip a coin, what's the chance it lands on heads? This simple question introduces us to the fundamental concepts of probability.",
                "action": "animate_coin_flip",
                "param": "show probability = 1/2"
            }
        ]
    }
}

# Science-focused templates  
SCIENCE_TEMPLATES = {
    "physics": {
        "title": "Physics Fundamentals",
        "scenes": [
            {
                "id": "scene_1",
                "duration": 25,
                "narration": "Physics is the study of matter, energy, and their interactions. It helps us understand everything from atoms to galaxies.",
                "action": "title_card",
                "param": "Physics: Understanding the Universe"
            },
            {
                "id": "scene_2",
                "duration": 30, 
                "narration": "Newton's laws govern motion around us. When you push a door, the door pushes back with equal force - that's Newton's third law in action.",
                "action": "demonstrate_force",
                "param": "action-reaction pairs"
            }
        ]
    },
    
    "chemistry": {
        "title": "Chemical Reactions",
        "scenes": [
            {
                "id": "scene_1",
                "duration": 25,
                "narration": "Chemistry is the study of matter and the changes it undergoes. Every breath you take involves chemical reactions.",
                "action": "title_card",
                "param": "Chemistry: The Science of Change"
            },
            {
                "id": "scene_2",
                "duration": 30,
                "narration": "When iron rusts, atoms are rearranging to form new compounds. This is a chemical reaction happening all around us.",
                "action": "show_reaction",
                "param": "Fe + O₂ → Fe₂O₃"
            }
        ]
    }
}

# Programming templates
PROGRAMMING_TEMPLATES = {
    "loops": {
        "title": "Programming Loops",
        "scenes": [
            {
                "id": "scene_1",
                "duration": 20,
                "narration": "Loops let computers repeat tasks efficiently. Instead of writing the same code 100 times, we write it once and loop it.",
                "action": "title_card",
                "param": "Loops: Efficient Repetition"
            },
            {
                "id": "scene_2",
                "duration": 35,
                "narration": "A 'for' loop runs a specific number of times. Think of it like saying 'do this 10 times' - the computer counts and stops automatically.",
                "action": "show_code",
                "param": "for i in range(10): print(i)"
            }
        ]
    },
    
    "algorithms": {
        "title": "Algorithmic Thinking", 
        "scenes": [
            {
                "id": "scene_1",
                "duration": 25,
                "narration": "An algorithm is a step-by-step solution to a problem. Like a recipe, it breaks complex tasks into simple, ordered steps.",
                "action": "title_card",
                "param": "Algorithms: Step-by-Step Solutions"
            },
            {
                "id": "scene_2",
                "duration": 30,
                "narration": "Finding the largest number in a list is algorithmic thinking: start with the first number, compare it to each other number, and keep track of the largest.",
                "action": "animate_algorithm",
                "param": "find maximum algorithm"
            }
        ]
    }
}

def get_template(topic: str, style: str = "general") -> dict:
    """Get high-quality template based on topic and style"""
    topic_lower = topic.lower()
    
    # Math topics
    if any(word in topic_lower for word in ["calculus", "derivative", "integral", "limit"]):
        return MATH_TEMPLATES["calculus"]
    elif any(word in topic_lower for word in ["algebra", "equation", "variable", "solve"]):
        return MATH_TEMPLATES["algebra"] 
    elif any(word in topic_lower for word in ["probability", "statistics", "chance", "random"]):
        return MATH_TEMPLATES["probability"]
    
    # Science topics
    elif any(word in topic_lower for word in ["physics", "force", "motion", "newton"]):
        return SCIENCE_TEMPLATES["physics"]
    elif any(word in topic_lower for word in ["chemistry", "reaction", "molecule", "atom"]):
        return SCIENCE_TEMPLATES["chemistry"]
        
    # Programming topics
    elif any(word in topic_lower for word in ["loop", "for", "while", "iteration"]):
        return PROGRAMMING_TEMPLATES["loops"]
    elif any(word in topic_lower for word in ["algorithm", "thinking", "problem", "solve"]):
        return PROGRAMMING_TEMPLATES["algorithms"]
    
    # Default template
    return {
        "title": f"Introduction to {topic}",
        "scenes": [
            {
                "id": "scene_1",
                "duration": 25,
                "narration": f"Today we'll explore {topic} and discover why it's an important concept to understand.",
                "action": "title_card",
                "param": f"Understanding {topic}"
            },
            {
                "id": "scene_2", 
                "duration": 30,
                "narration": f"Let's start with the fundamental ideas behind {topic} and see how they apply to real-world situations.",
                "action": "concept_intro",
                "param": f"core concepts of {topic}"
            },
            {
                "id": "scene_3",
                "duration": 25,
                "narration": f"Understanding {topic} gives us powerful tools for solving problems and making sense of complex ideas.",
                "action": "summary_card",
                "param": f"key takeaways from {topic}"
            }
        ]
    }