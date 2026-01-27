"""
Cognitive Processing Module - The "Brain"
Transforms context blocks into structured knowledge graphs
Uses real API connections - no mock data
"""

import json
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import networkx as nx
import numpy as np

from config import config
try:
    from services.api_client import api_client
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from services.api_client import api_client


@dataclass
class KnowledgeEntity:
    """Represents a concept in the knowledge graph"""
    id: str
    name: str
    entity_type: str  # concept, formula, theorem, etc.
    description: Optional[str] = None
    confidence: float = 1.0
    metadata: Optional[Dict] = None
    embeddings: Optional[np.ndarray] = None
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.entity_type,
            "description": self.description,
            "confidence": self.confidence,
            "metadata": self.metadata or {},
            "has_embedding": self.embeddings is not None
        }


@dataclass
class KnowledgeRelationship:
    """Represents a relationship between entities"""
    source_id: str
    target_id: str
    relationship_type: str  # depends_on, is_a, part_of, etc.
    weight: float = 1.0
    evidence: Optional[List[str]] = None
    metadata: Optional[Dict] = None
    
    def to_dict(self) -> Dict:
        return {
            "source": self.source_id,
            "target": self.target_id,
            "type": self.relationship_type,
            "weight": self.weight,
            "evidence": self.evidence or [],
            "metadata": self.metadata or {}
        }


@dataclass
class PedagogicalTag:
    """Tag for pedagogical intent"""
    block_id: str
    tag_type: str  # definition, example, pitfall, etc.
    confidence: float
    reasoning: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            "block_id": self.block_id,
            "tag_type": self.tag_type,
            "confidence": self.confidence,
            "reasoning": self.reasoning
        }


class KnowledgeExtractor:
    """Extracts knowledge entities and relationships from text"""
    
    def __init__(self):
        self.model_config = config.get_models()["deepseek_v3"]
        self.entity_types = config.KNOWLEDGE_GRAPH_ENTITY_TYPES
        self.relationship_types = config.RELATIONSHIP_TYPES
    
    async def extract_from_text(self, text: str, context: Optional[str] = None) -> Tuple[List[KnowledgeEntity], List[KnowledgeRelationship]]:
        """
        Extract entities and relationships from text using DeepSeek-V3
        Uses real API connection
        """
        print(f"Extracting knowledge from text: {text[:100]}...")
        
        # Call DeepSeek API for knowledge extraction
        response = await api_client.deepseek.extract_knowledge(text, context or "")
        
        if not response.success:
            print(f"Knowledge extraction failed: {response.error}")
            # Return empty results on failure
            return [], []
        
        try:
            # Parse the response
            content = response.data.get("choices", [{}])[0].get("message", {}).get("content", "")
            
            # Parse JSON from the response
            extraction_data = json.loads(content)
            
            # Convert to KnowledgeEntity objects
            entities = []
            for entity_data in extraction_data.get("entities", []):
                entities.append(KnowledgeEntity(
                    id=entity_data.get("id", ""),
                    name=entity_data.get("name", ""),
                    entity_type=entity_data.get("type", "concept"),
                    description=entity_data.get("description", ""),
                    confidence=float(entity_data.get("confidence", 0.8))
                ))
            
            # Convert to KnowledgeRelationship objects
            relationships = []
            for rel_data in extraction_data.get("relationships", []):
                relationships.append(KnowledgeRelationship(
                    source_id=rel_data.get("source", ""),
                    target_id=rel_data.get("target", ""),
                    relationship_type=rel_data.get("type", "related_to"),
                    weight=float(rel_data.get("weight", 0.5)),
                    evidence=rel_data.get("evidence", [])
                ))
            
            print(f"Extracted {len(entities)} entities and {len(relationships)} relationships")
            return entities, relationships
            
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"Error parsing knowledge extraction response: {e}")
            # Return empty results on parsing error
            return [], []
    
    def merge_entities(self, entities: List[KnowledgeEntity]) -> List[KnowledgeEntity]:
        """Merge duplicate entities"""
        merged = {}
        for entity in entities:
            if entity.id in merged:
                # Update confidence and merge metadata
                existing = merged[entity.id]
                existing.confidence = max(existing.confidence, entity.confidence)
                if entity.description and not existing.description:
                    existing.description = entity.description
                if entity.metadata:
                    existing.metadata = {**(existing.metadata or {}), **entity.metadata}
            else:
                merged[entity.id] = entity
        
        return list(merged.values())


class GraphBuilder:
    """Builds and manages the knowledge graph"""
    
    def __init__(self):
        self.graph = nx.DiGraph()
        self.entity_types = config.KNOWLEDGE_GRAPH_ENTITY_TYPES
    
    def add_entity(self, entity: KnowledgeEntity) -> None:
        """Add an entity to the graph"""
        self.graph.add_node(
            entity.id,
            **entity.to_dict()
        )
    
    def add_relationship(self, relationship: KnowledgeRelationship) -> None:
        """Add a relationship to the graph"""
        self.graph.add_edge(
            relationship.source_id,
            relationship.target_id,
            **relationship.to_dict()
        )
    
    def find_gaps(self, target_concept: str) -> List[Tuple[str, str, float]]:
        """
        Find knowledge gaps for a target concept
        Returns: List of (missing_concept, relationship_type, importance)
        """
        if target_concept not in self.graph:
            return []
        
        # Find prerequisites that are missing
        prerequisites = []
        for node in self.graph.nodes():
            if node != target_concept:
                # Check if there should be a relationship
                # This is a simplified heuristic
                importance = self._calculate_importance(node, target_concept)
                if importance > 0.5:
                    prerequisites.append((node, "prerequisite", importance))
        
        return sorted(prerequisites, key=lambda x: x[2], reverse=True)
    
    def _calculate_importance(self, source: str, target: str) -> float:
        """Calculate importance of relationship between nodes"""
        # Simplified importance calculation
        # In reality, this would use embeddings and graph analysis
        try:
            # Check if path exists
            if nx.has_path(self.graph, source, target):
                path_length = nx.shortest_path_length(self.graph, source, target)
                return 1.0 / (path_length + 1)
        except nx.NetworkXNoPath:
            pass
        
        return 0.0
    
    def to_networkx(self) -> nx.DiGraph:
        """Get the networkx graph"""
        return self.graph
    
    def to_json(self) -> Dict:
        """Convert graph to JSON serializable format"""
        return {
            "nodes": [
                {**data, "id": node_id}
                for node_id, data in self.graph.nodes(data=True)
            ],
            "edges": [
                {**data, "source": u, "target": v}
                for u, v, data in self.graph.edges(data=True)
            ]
        }


class PedagogicalTagger:
    """Tags context blocks with pedagogical intent"""
    
    def __init__(self):
        # Simplified classifier - would use BERT in production
        self.tag_types = ["definition", "example", "pitfall", "prerequisite", "application"]
    
    async def tag_block(self, block_text: str, slide_text: str = "") -> List[PedagogicalTag]:
        """
        Tag a context block with pedagogical intent
        """
        tags = []
        
        # Simple rule-based tagging (would use ML model in production)
        text_lower = (block_text + " " + slide_text).lower()
        
        # Check for definitions
        definition_keywords = ["定义", "是", "称为", "指的是", "meaning", "definition"]
        if any(keyword in text_lower for keyword in definition_keywords):
            tags.append(PedagogicalTag(
                block_id="",  # Would be actual block ID
                tag_type="definition",
                confidence=0.8,
                reasoning="包含定义性语言"
            ))
        
        # Check for examples
        example_keywords = ["例如", "比如", "举例", "example", "for instance"]
        if any(keyword in text_lower for keyword in example_keywords):
            tags.append(PedagogicalTag(
                block_id="",
                tag_type="example",
                confidence=0.85,
                reasoning="包含示例说明"
            ))
        
        # Check for pitfalls
        pitfall_keywords = ["注意", "容易", "错误", "常见", "小心", "pitfall", "common mistake"]
        if any(keyword in text_lower for keyword in pitfall_keywords):
            tags.append(PedagogicalTag(
                block_id="",
                tag_type="pitfall",
                confidence=0.75,
                reasoning="提到常见错误或注意事项"
            ))
        
        return tags


class CognitiveProcessor:
    """Main cognitive processing pipeline"""
    
    def __init__(self):
        self.extractor = KnowledgeExtractor()
        self.graph_builder = GraphBuilder()
        self.tagger = PedagogicalTagger()
        self.processing_config = config.PROCESSING
    
    async def process_context_blocks(self, context_blocks: List[Dict]) -> Dict:
        """
        Process context blocks to build knowledge graph
        """
        all_entities = []
        all_relationships = []
        pedagogical_tags = []
        
        for block in context_blocks:
            # Extract knowledge from combined text
            combined_text = f"{block.get('audio_text', '')} {block.get('slide_text', '')}"
            entities, relationships = await self.extractor.extract_from_text(
                combined_text,
                context=f"Timestamp: {block.get('timestamp', 0)}s"
            )
            
            all_entities.extend(entities)
            all_relationships.extend(relationships)
            
            # Tag pedagogical intent
            tags = await self.tagger.tag_block(
                block.get('audio_text', ''),
                block.get('slide_text', '')
            )
            pedagogical_tags.extend(tags)
        
        # Merge duplicate entities
        merged_entities = self.extractor.merge_entities(all_entities)
        
        # Build graph
        for entity in merged_entities:
            self.graph_builder.add_entity(entity)
        
        for relationship in all_relationships:
            self.graph_builder.add_relationship(relationship)
        
        # Analyze graph structure
        graph_stats = self._analyze_graph()
        
        return {
            "entities": [e.to_dict() for e in merged_entities],
            "relationships": [r.to_dict() for r in all_relationships],
            "pedagogical_tags": [t.to_dict() for t in pedagogical_tags],
            "graph_stats": graph_stats,
            "graph_json": self.graph_builder.to_json()
        }
    
    def _analyze_graph(self) -> Dict:
        """Analyze graph structure and statistics"""
        graph = self.graph_builder.to_networkx()
        
        return {
            "total_nodes": graph.number_of_nodes(),
            "total_edges": graph.number_of_edges(),
            "density": nx.density(graph),
            "connected_components": nx.number_weakly_connected_components(graph),
            "node_types": self._count_node_types(graph),
            "edge_types": self._count_edge_types(graph)
        }
    
    def _count_node_types(self, graph: nx.DiGraph) -> Dict[str, int]:
        """Count nodes by type"""
        counts = {}
        for _, data in graph.nodes(data=True):
            node_type = data.get('type', 'unknown')
            counts[node_type] = counts.get(node_type, 0) + 1
        return counts
    
    def _count_edge_types(self, graph: nx.DiGraph) -> Dict[str, int]:
        """Count edges by type"""
        counts = {}
        for _, _, data in graph.edges(data=True):
            edge_type = data.get('type', 'unknown')
            counts[edge_type] = counts.get(edge_type, 0) + 1
        return counts
    
    async def diagnose_student_gap(
        self,
        student_query: str,
        failed_concepts: List[str]
    ) -> Dict:
        """
        Diagnose student knowledge gaps
        """
        diagnosis = {
            "query": student_query,
            "failed_concepts": failed_concepts,
            "missing_prerequisites": [],
            "recommended_path": []
        }
        
        for concept in failed_concepts:
            gaps = self.graph_builder.find_gaps(concept)
            diagnosis["missing_prerequisites"].extend(gaps)
            
            # Build learning path
            if gaps:
                path = self._build_learning_path(concept, gaps)
                diagnosis["recommended_path"].append({
                    "target_concept": concept,
                    "path": path
                })
        
        return diagnosis
    
    def _build_learning_path(self, target_concept: str, gaps: List[Tuple[str, str, float]]) -> List[Dict]:
        """Build learning path to address gaps"""
        path = []
        
        # Sort gaps by importance
        sorted_gaps = sorted(gaps, key=lambda x: x[2], reverse=True)
        
        for missing_concept, relationship_type, importance in sorted_gaps[:3]:  # Top 3 gaps
            path.append({
                "concept": missing_concept,
                "relationship": relationship_type,
                "importance": importance,
                "action": f"学习{missing_concept}作为{target_concept}的前提"
            })
        
        path.append({
            "concept": target_concept,
            "relationship": "target",
            "importance": 1.0,
            "action": f"掌握{target_concept}"
        })
        
        return path


# Example usage
async def example_usage():
    """Example of cognitive processing"""
    processor = CognitiveProcessor()
    
    # Example context blocks from ingestion module
    context_blocks = [
        {
            "timestamp": 0.0,
            "audio_text": "二次方程的一般形式是 ax² + bx + c = 0",
            "slide_text": "二次方程 Quadratic Equations\nax² + bx + c = 0",
            "confidence": 0.9
        },
        {
            "timestamp": 12.5,
            "audio_text": "解二次方程可以使用二次公式",
            "slide_text": "二次公式\nx = [-b ± √(b² - 4ac)] / 2a",
            "confidence": 0.95
        }
    ]
    
    # Process to build knowledge graph
    result = await processor.process_context_blocks(context_blocks)
    
    print(f"Extracted {len(result['entities'])} entities")
    print(f"Found {len(result['relationships'])} relationships")
    print(f"Graph has {result['graph_stats']['total_nodes']} nodes and {result['graph_stats']['total_edges']} edges")
    
    # Diagnose student gap
    diagnosis = await processor.diagnose_student_gap(
        "我不理解二次方程",
        ["quadratic_equation"]
    )
    
    print(f"\nDiagnosis for student query:")
    print(f"Missing prerequisites: {len(diagnosis['missing_prerequisites'])}")
    
    return result, diagnosis


if __name__ == "__main__":
    import asyncio
    asyncio.run(example_usage())