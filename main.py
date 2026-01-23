"""
MentorMind Backend - Production Main File
Uses real API connections with no mock data
"""

import asyncio
import os
import sys
from datetime import datetime

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import config
from api_client import api_client
from modules.cognitive import CognitiveProcessor
from modules.agentic import TeachingAgent
from modules.output import OutputPipeline


async def test_api_connections():
    """Test all API connections"""
    print("Testing API connections...")
    
    results = await api_client.test_connection()
    
    print("\nAPI Connection Results:")
    all_connected = True
    for service, status in results.items():
        status_icon = "✅" if status else "❌"
        print(f"{status_icon} {service}: {'Connected' if status else 'Failed'}")
        if not status:
            all_connected = False
    
    return all_connected


async def process_student_query(student_query: str):
    """Process a student query using real APIs"""
    print(f"\nProcessing student query: {student_query}")
    
    try:
        # Initialize modules
        cognitive_processor = CognitiveProcessor()
        teaching_agent = TeachingAgent()
        output_pipeline = OutputPipeline()
        
        # Step 1: Create context from query (simplified for demo)
        # In production, this would use audio/video processing
        context_blocks = [{
            "timestamp": 0.0,
            "audio_text": student_query,
            "slide_text": "",
            "confidence": 1.0
        }]
        
        # Step 2: Cognitive processing
        print("Step 1: Cognitive processing...")
        cognitive_result = await cognitive_processor.process_context_blocks(context_blocks)
        
        print(f"  Extracted {len(cognitive_result['entities'])} entities")
        print(f"  Found {len(cognitive_result['relationships'])} relationships")
        
        # Step 3: Generate lesson plan
        print("\nStep 2: Generating lesson plan...")
        lesson_plan, quality_assessment, attempts = await teaching_agent.teach(
            student_query=student_query,
            knowledge_graph=cognitive_result,
            student_level="beginner",
            max_attempts=2
        )
        
        print(f"  Generated lesson: {lesson_plan.title}")
        print(f"  Quality score: {quality_assessment.overall_score:.2f}/1.0")
        print(f"  Attempts made: {attempts}")
        print(f"  Duration: {lesson_plan.total_duration_minutes} minutes")
        print(f"  Steps: {len(lesson_plan.steps)}")
        
        # Step 4: Generate output
        print("\nStep 3: Generating teaching output...")
        output_result = await output_pipeline.generate_teaching_output(lesson_plan.to_dict())
        
        print(f"  Script generated: {output_result['script']['title']}")
        print(f"  Audio duration: {output_result['audio']['duration_seconds']:.1f}s")
        print(f"  Video duration: {output_result['video']['duration_seconds']}s")
        print(f"  Total cost: ${output_result['metadata']['cost_estimation']['total_usd']:.4f}")
        
        # Save results
        import json
        results_dir = "results"
        os.makedirs(results_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        results_file = os.path.join(results_dir, f"lesson_{timestamp}.json")
        
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "student_query": student_query,
                "lesson_plan": lesson_plan.to_dict(),
                "quality_assessment": quality_assessment.to_dict(),
                "output_result": output_result,
                "cognitive_result": cognitive_result
            }, f, ensure_ascii=False, indent=2)
        
        print(f"\n✅ Results saved to: {results_file}")
        
        return {
            "success": True,
            "lesson_plan": lesson_plan,
            "quality_assessment": quality_assessment,
            "output_result": output_result,
            "results_file": results_file
        }
        
    except Exception as e:
        print(f"\n❌ Error processing query: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


async def interactive_mode():
    """Interactive mode for testing"""
    print("\n" + "="*60)
    print("MENTORMIND BACKEND - INTERACTIVE MODE")
    print("="*60)
    
    # Test API connections first
    if not await test_api_connections():
        print("\n⚠️  Some API connections failed. Continuing anyway...")
    
    while True:
        print("\n" + "-"*40)
        print("Enter a student query (or 'quit' to exit):")
        print("Examples:")
        print("  1. 我想学习Python编程，从哪里开始？")
        print("  2. 我不理解二次方程，考试总是错")
        print("  3. 请解释一下微积分的基本概念")
        print("-"*40)
        
        query = input("\nQuery: ").strip()
        
        if query.lower() in ['quit', 'exit', 'q']:
            print("Goodbye!")
            break
        
        if not query:
            print("Please enter a query.")
            continue
        
        print(f"\nProcessing: {query}")
        result = await process_student_query(query)
        
        if result.get("success"):
            print("\n✅ Processing complete!")
        else:
            print(f"\n❌ Processing failed: {result.get('error')}")
        
        print("\nPress Enter to continue...")
        input()


async def batch_mode(queries: list):
    """Process multiple queries in batch mode"""
    print("\n" + "="*60)
    print("MENTORMIND BACKEND - BATCH MODE")
    print("="*60)
    
    # Test API connections first
    if not await test_api_connections():
        print("\n⚠️  Some API connections failed. Exiting.")
        return
    
    results = []
    for i, query in enumerate(queries, 1):
        print(f"\n[{i}/{len(queries)}] Processing: {query}")
        result = await process_student_query(query)
        results.append(result)
    
    # Summary
    print("\n" + "="*60)
    print("BATCH PROCESSING SUMMARY")
    print("="*60)
    
    successful = sum(1 for r in results if r.get("success"))
    print(f"Total queries: {len(queries)}")
    print(f"Successful: {successful}")
    print(f"Failed: {len(queries) - successful}")
    
    if successful > 0:
        total_cost = sum(
            r.get("output_result", {}).get("metadata", {}).get("cost_estimation", {}).get("total_usd", 0)
            for r in results if r.get("success")
        )
        print(f"Total cost: ${total_cost:.4f}")
    
    return results


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="MentorMind Backend")
    parser.add_argument("--mode", choices=["interactive", "batch", "test"], default="interactive",
                       help="Operation mode")
    parser.add_argument("--query", type=str, help="Single query to process")
    parser.add_argument("--file", type=str, help="File containing queries (one per line)")
    
    args = parser.parse_args()
    
    if args.mode == "test":
        # Just test API connections
        asyncio.run(test_api_connections())
    
    elif args.mode == "batch" and args.file:
        # Batch mode from file
        with open(args.file, 'r', encoding='utf-8') as f:
            queries = [line.strip() for line in f if line.strip()]
        asyncio.run(batch_mode(queries))
    
    elif args.query:
        # Single query mode
        asyncio.run(process_student_query(args.query))
    
    else:
        # Interactive mode
        asyncio.run(interactive_mode())


if __name__ == "__main__":
    # Create necessary directories
    os.makedirs("data/audio", exist_ok=True)
    os.makedirs("data/videos", exist_ok=True)
    os.makedirs("data/test", exist_ok=True)
    os.makedirs("logs", exist_ok=True)
    os.makedirs(".cache", exist_ok=True)
    os.makedirs("assets", exist_ok=True)
    os.makedirs("results", exist_ok=True)
    
    # Run main function
    main()