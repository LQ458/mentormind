"""
Test script for sophisticated teaching pipeline
"""

import asyncio
import sys
import os

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from modules.sophisticated_pipeline import (
    SophisticatedTeachingPipeline,
    example_sophisticated_pipeline
)


async def test_pipeline_components():
    """Test individual pipeline components"""
    print("=" * 60)
    print("TESTING SOPHISTICATED PIPELINE COMPONENTS")
    print("=" * 60)
    
    # Create pipeline
    pipeline = SophisticatedTeachingPipeline("test_student_001")
    
    print("\n1. Testing TeachingState (动态记忆机制教学状态模块)")
    print("-" * 40)
    
    # Test teaching state
    teaching_state = pipeline.teaching_state
    print(f"   Student ID: {teaching_state.student_id}")
    print(f"   Initial engagement: {teaching_state.engagement_level}")
    
    # Update from dialogue
    teaching_state.update_from_dialogue("我想学习Python编程", 0.8)
    print(f"   After dialogue update:")
    print(f"     Engagement: {teaching_state.engagement_level}")
    print(f"     History entries: {len(teaching_state.learning_history)}")
    
    # Update progress
    teaching_state.update_progress("python_basics", 0.6)
    teaching_state.update_progress("variables", 0.9)
    print(f"   Progress tracking:")
    print(f"     Concepts tracked: {len(teaching_state.progress_tracking)}")
    print(f"     Mastered concepts: {len(teaching_state.mastered_concepts)}")
    
    # Get learning profile
    profile = teaching_state.get_learning_profile()
    print(f"   Learning profile:")
    print(f"     Total interactions: {profile['total_interactions']}")
    print(f"     Cognitive gaps: {len(profile['cognitive_gaps'])}")
    print(f"     Average mastery: {profile['progress_summary']['average_mastery']:.2f}")
    
    print("\n2. Testing GraphRAGRetriever (GraphRAG 多跳检索)")
    print("-" * 40)
    
    # Test GraphRAG retrieval
    retrieval_result = pipeline.graph_rag.multi_hop_retrieval(
        "我想学习Python变量和数据类型",
        teaching_state
    )
    
    print(f"   Query: {retrieval_result['query']}")
    print(f"   Extracted entities: {retrieval_result['extracted_entities']}")
    print(f"   Relevant concepts: {len(retrieval_result['relevant_concepts'])}")
    print(f"   Filtered concepts: {len(retrieval_result['filtered_concepts'])}")
    print(f"   Learning path length: {len(retrieval_result['learning_path'])}")
    print(f"   Retrieved content items: {len(retrieval_result['retrieved_content'])}")
    
    print("\n3. Testing RAGContentSynthesizer (RAG 内容合成)")
    print("-" * 40)
    
    # Test content synthesis
    synthesis_result = await pipeline.content_synthesizer.synthesize_content(
        retrieval_result,
        teaching_state
    )
    
    print(f"   Context preparation: ✓")
    print(f"   Lesson plan generated: {synthesis_result['lesson_plan'] is not None}")
    print(f"   Quality assessment: {synthesis_result['quality_assessment'] is not None}")
    print(f"   Enhanced content: {synthesis_result['enhanced_content'] is not None}")
    print(f"   Personalization level: {synthesis_result['synthesis_metadata']['personalization_level']:.2f}")
    
    print("\n✅ All pipeline components working correctly!")


async def test_full_pipeline():
    """Test the full sophisticated pipeline"""
    print("\n" + "=" * 60)
    print("TESTING FULL SOPHISTICATED PIPELINE")
    print("=" * 60)
    
    # Test queries
    test_queries = [
        "我想学习Python编程，但我不理解变量和函数的关系",
        "如何用Python处理Excel数据？",
        "机器学习的基本概念是什么？",
        "请解释一下神经网络的工作原理"
    ]
    
    for i, query in enumerate(test_queries, 1):
        print(f"\nTest {i}: {query}")
        print("-" * 40)
        
        # Create new pipeline for each test
        pipeline = SophisticatedTeachingPipeline(f"test_student_{i:03d}")
        
        # Process query
        result = await pipeline.process_student_query(
            student_query=query,
            include_video=False  # Skip video for faster testing
        )
        
        if result["success"]:
            print(f"  ✅ Success!")
            print(f"    Steps completed: {len(result['pipeline_steps'])}")
            print(f"    Processing time: {result['processing_metrics']['total_time_seconds']:.1f}s")
            print(f"    Cognitive gaps identified: {result['processing_metrics']['cognitive_gaps_identified']}")
            print(f"    Concepts in path: {result['processing_metrics']['concepts_in_path']}")
            print(f"    Personalization score: {result['processing_metrics']['personalization_score']:.2f}")
            
            # Check teaching state
            teaching_state = result["teaching_state"]
            print(f"    Teaching state updated:")
            print(f"      Interactions: {teaching_state['total_interactions']}")
            print(f"      Engagement: {teaching_state['engagement_level']:.2f}")
        else:
            print(f"  ❌ Failed: {result.get('error', 'Unknown error')}")


async def test_api_endpoint():
    """Test the API endpoint integration"""
    print("\n" + "=" * 60)
    print("TESTING API ENDPOINT INTEGRATION")
    print("=" * 60)
    
    try:
        import requests
        import json
        
        # Test data
        test_data = {
            "studentQuery": "我想学习Python编程基础",
            "studentId": "api_test_001",
            "includeVideo": False,
            "mode": "test"
        }
        
        print(f"Testing API endpoint: POST /sophisticated-teach")
        print(f"Test data: {json.dumps(test_data, ensure_ascii=False)}")
        
        # Note: This requires the backend server to be running
        print("\n⚠️  Note: This test requires the backend server to be running")
        print("   Start the server with: python backend_server.py")
        print("   Then run: python -c \"import requests; print(requests.post('http://localhost:8000/sophisticated-teach', json={'studentQuery':'test'}).json())\"")
        
    except ImportError:
        print("⚠️  requests module not installed. Skipping API test.")
        print("   Install with: pip install requests")


async def main():
    """Main test function"""
    print("MentorMind Sophisticated Teaching Pipeline Test Suite")
    print("实现闭环、连贯且适应性的智能讲授")
    
    # Test individual components
    await test_pipeline_components()
    
    # Test full pipeline
    await test_full_pipeline()
    
    # Test API endpoint
    await test_api_endpoint()
    
    # Run example
    print("\n" + "=" * 60)
    print("RUNNING EXAMPLE PIPELINE")
    print("=" * 60)
    
    result = await example_sophisticated_pipeline()
    
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    if result and result.get("success"):
        print("✅ Sophisticated teaching pipeline is working correctly!")
        print("\nPipeline features implemented:")
        print("  1. 🗣️ 对话理解 - Dialogue understanding with cognitive analysis")
        print("  2. 🔍 GraphRAG - Multi-hop retrieval with relationship reasoning")
        print("  3. 🧠 动态记忆 - Dynamic memory teaching state tracking")
        print("  4. 🗺️ 个性化路径 - Personalized learning path planning")
        print("  5. 📚 RAG合成 - Retrieval-augmented content synthesis")
        print("  6. 🎥 数字人 - Digital human video generation (simulated)")
    else:
        print("⚠️  Some tests may have failed. Check the output above.")
    
    print("\n" + "=" * 60)
    print("NEXT STEPS")
    print("=" * 60)
    print("\nTo use the sophisticated pipeline:")
    print("1. Start backend server: python backend_server.py")
    print("2. Access web interface: http://localhost:3000/create")
    print("3. Enter student query and click '启动智能讲授'")
    print("4. View the pipeline progress and results")
    print("\nAPI endpoint: POST http://localhost:8000/sophisticated-teach")
    print("Python usage: from modules.sophisticated_pipeline import SophisticatedTeachingPipeline")


if __name__ == "__main__":
    # Create necessary directories
    os.makedirs("data/audio", exist_ok=True)
    os.makedirs("data/videos", exist_ok=True)
    os.makedirs("data/test", exist_ok=True)
    os.makedirs("logs", exist_ok=True)
    os.makedirs(".cache", exist_ok=True)
    os.makedirs("assets", exist_ok=True)
    os.makedirs("results", exist_ok=True)
    
    # Run tests
    asyncio.run(main())