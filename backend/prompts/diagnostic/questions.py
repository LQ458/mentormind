"""Seed bank of diagnostic questions for adaptive branching (F1).

Each question is tagged with (subject, difficulty 1-3). The branching logic in
`core/diagnostic_branching.py` starts at difficulty 2 and walks up/down based
on correctness. The LLM-driven endpoint at /users/me/diagnostic can use these
as prompt seeds when the user's subject matches.
"""

from dataclasses import dataclass
from typing import List, Literal, Optional

Difficulty = Literal[1, 2, 3]


@dataclass(frozen=True)
class Question:
    id: str
    subject: str
    difficulty: Difficulty
    prompt: str
    options: List[str]
    correct_index: int
    explanation: Optional[str] = None


QUESTION_BANK: List[Question] = [
    # --- Math (arithmetic / algebra / calculus) ---
    Question(
        id="math-d1-01",
        subject="math",
        difficulty=1,
        prompt="What is 12 + 7?",
        options=["17", "19", "21", "25"],
        correct_index=1,
    ),
    Question(
        id="math-d2-01",
        subject="math",
        difficulty=2,
        prompt="Solve for x: 3x + 5 = 20.",
        options=["3", "5", "7", "15"],
        correct_index=1,
    ),
    Question(
        id="math-d2-02",
        subject="math",
        difficulty=2,
        prompt="The slope of the line through (1, 2) and (4, 8) is:",
        options=["1", "2", "3", "6"],
        correct_index=1,
    ),
    Question(
        id="math-d3-01",
        subject="math",
        difficulty=3,
        prompt="d/dx of x^3 · sin(x) equals:",
        options=[
            "3x^2 · cos(x)",
            "3x^2 · sin(x) + x^3 · cos(x)",
            "x^3 · cos(x)",
            "3x^2 · sin(x)",
        ],
        correct_index=1,
    ),
    Question(
        id="math-d3-02",
        subject="math",
        difficulty=3,
        prompt="∫ from 0 to 1 of 2x dx =",
        options=["0", "1", "2", "1/2"],
        correct_index=1,
    ),
    # --- CS (fundamentals / algorithms) ---
    Question(
        id="cs-d1-01",
        subject="cs",
        difficulty=1,
        prompt="Which data structure uses LIFO order?",
        options=["queue", "stack", "heap", "tree"],
        correct_index=1,
    ),
    Question(
        id="cs-d2-01",
        subject="cs",
        difficulty=2,
        prompt="Average-case time complexity of binary search is:",
        options=["O(1)", "O(log n)", "O(n)", "O(n log n)"],
        correct_index=1,
    ),
    Question(
        id="cs-d2-02",
        subject="cs",
        difficulty=2,
        prompt="Which SQL clause filters rows after aggregation?",
        options=["WHERE", "HAVING", "GROUP BY", "ORDER BY"],
        correct_index=1,
    ),
    Question(
        id="cs-d3-01",
        subject="cs",
        difficulty=3,
        prompt="Which pair has the same asymptotic complexity?",
        options=[
            "merge sort vs. bubble sort",
            "heap sort vs. merge sort",
            "quick sort worst vs. insertion sort worst",
            "both (b) and (c)",
        ],
        correct_index=3,
    ),
    Question(
        id="cs-d3-02",
        subject="cs",
        difficulty=3,
        prompt="A hash table with a bad hash function degrades lookup to:",
        options=["O(1)", "O(log n)", "O(n)", "O(n^2)"],
        correct_index=2,
    ),
    # --- Physics (mechanics / EM) ---
    Question(
        id="physics-d1-01",
        subject="physics",
        difficulty=1,
        prompt="SI unit of force is:",
        options=["joule", "newton", "watt", "pascal"],
        correct_index=1,
    ),
    Question(
        id="physics-d2-01",
        subject="physics",
        difficulty=2,
        prompt="A 2 kg object accelerating at 3 m/s^2 experiences a net force of:",
        options=["1.5 N", "5 N", "6 N", "9 N"],
        correct_index=2,
    ),
    Question(
        id="physics-d3-01",
        subject="physics",
        difficulty=3,
        prompt="Kinetic energy of a 1 kg mass at 10 m/s is:",
        options=["10 J", "50 J", "100 J", "1000 J"],
        correct_index=1,
    ),
    # --- Chemistry ---
    Question(
        id="chem-d1-01",
        subject="chemistry",
        difficulty=1,
        prompt="H2O is the formula for:",
        options=["oxygen gas", "water", "hydrogen peroxide", "ammonia"],
        correct_index=1,
    ),
    Question(
        id="chem-d2-01",
        subject="chemistry",
        difficulty=2,
        prompt="The pH of a neutral aqueous solution at 25°C is:",
        options=["0", "7", "10", "14"],
        correct_index=1,
    ),
    Question(
        id="chem-d3-01",
        subject="chemistry",
        difficulty=3,
        prompt="In the reaction N2 + 3H2 → 2NH3, doubling N2 concentration (first order in N2) makes rate:",
        options=["half", "unchanged", "double", "quadruple"],
        correct_index=2,
    ),
    # --- Biology ---
    Question(
        id="bio-d1-01",
        subject="biology",
        difficulty=1,
        prompt="Which organelle is the powerhouse of the cell?",
        options=["nucleus", "mitochondrion", "ribosome", "lysosome"],
        correct_index=1,
    ),
    Question(
        id="bio-d2-01",
        subject="biology",
        difficulty=2,
        prompt="DNA replication is:",
        options=["conservative", "semi-conservative", "dispersive", "random"],
        correct_index=1,
    ),
    Question(
        id="bio-d3-01",
        subject="biology",
        difficulty=3,
        prompt="The enzyme that unwinds DNA at the replication fork is:",
        options=["ligase", "helicase", "polymerase", "primase"],
        correct_index=1,
    ),
]
