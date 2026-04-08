#!/usr/bin/env python3
"""
Video Generation Unit Test Script
Generates multiple videos with random topics to test system performance and collect metrics.
"""

import asyncio
import json
import time
import uuid
from datetime import datetime
from typing import List, Dict, Any
import requests
import random

# Test Topics for Video Generation
TEST_TOPICS = [
    # Mathematics
    "Quadratic equations and their applications",
    "Introduction to calculus limits",
    "Probability and statistics basics",
    "Linear algebra matrices",
    "Trigonometric functions and graphs",
    
    # Science
    "DNA replication process",
    "Chemical bonding and molecular structure", 
    "Newton's laws of motion",
    "Photosynthesis in plants",
    "Electromagnetic waves and frequencies",
    
    # Computer Science
    "Python loops and conditionals",
    "Object-oriented programming concepts",
    "Database design and normalization",
    "Machine learning fundamentals",
    "Web development with React",
    
    # History & Social Studies
    "World War II key events",
    "Ancient Greek democracy",
    "Industrial Revolution impacts",
    "Climate change causes and effects",
    "International trade economics",
    
    # Languages & Literature
    "English grammar and sentence structure",
    "Spanish verb conjugations",
    "Shakespeare's writing techniques",
    "Chinese character evolution",
    "French pronunciation rules"
]

class VideoGenerationTester:
    def __init__(self, base_url="http://localhost:8000"):
        self.base_url = base_url
        self.results = []
        self.start_time = None
        self.test_session_id = str(uuid.uuid4())
        
    def generate_test_request(self, topic: str) -> Dict[str, Any]:
        """Generate a test request payload for video generation."""
        return {
            "topic": topic,
            "language": random.choice(["en", "zh"]),
            "student_level": random.choice(["beginner", "intermediate", "advanced"]),
            "duration_minutes": random.choice([10, 15, 20, 30]),
            "include_video": True,
            "include_exercises": True,
            "include_assessment": True,
            "voice_id": random.choice(["anna", "daniel", "jenny"]),
            "custom_requirements": f"Create an educational video about {topic}. Focus on clear explanations and practical examples.",
            "test_session": self.test_session_id
        }
    
    async def create_video(self, topic: str) -> Dict[str, Any]:
        """Create a single video and track metrics."""
        print(f"\n🎬 Starting video generation: {topic}")
        start_time = time.time()
        
        payload = self.generate_test_request(topic)
        
        try:
            # Start video generation
            response = requests.post(
                f"{self.base_url}/create-class",
                json=payload,
                timeout=60
            )
            
            if not response.ok:
                return {
                    "topic": topic,
                    "success": False,
                    "error": f"HTTP {response.status_code}",
                    "duration": time.time() - start_time
                }
            
            data = response.json()
            if not data.get("job_id"):
                return {
                    "topic": topic, 
                    "success": False,
                    "error": "No job ID returned",
                    "duration": time.time() - start_time
                }
            
            job_id = data["job_id"]
            print(f"📋 Job started: {job_id}")
            
            # Poll for completion
            max_attempts = 300  # 10 minutes max
            for attempt in range(max_attempts):
                try:
                    status_response = requests.get(
                        f"{self.base_url}/job-status/{job_id}",
                        timeout=30
                    )
                    
                    if status_response.ok:
                        status_data = status_response.json()
                        
                        if status_data.get("status") == "completed":
                            total_duration = time.time() - start_time
                            result = status_data.get("result", {})
                            
                            return {
                                "topic": topic,
                                "success": result.get("success", False),
                                "duration": total_duration,
                                "job_id": job_id,
                                "language": result.get("language"),
                                "student_level": result.get("student_level", payload["student_level"]),
                                "video_url": result.get("video_url"),
                                "audio_url": result.get("audio_url"),
                                "quality_score": result.get("quality_evaluation", {}).get("overall_score"),
                                "cost_usd": result.get("ai_insights", {}).get("estimated_cost"),
                                "generation_metrics": result.get("ai_insights", {}).get("generation_timing", {}),
                                "error": result.get("error"),
                                "lesson_id": result.get("lesson_id"),
                                "timestamp": datetime.now().isoformat()
                            }
                        
                        elif status_data.get("status") == "failed":
                            return {
                                "topic": topic,
                                "success": False,
                                "duration": time.time() - start_time,
                                "job_id": job_id,
                                "error": status_data.get("error", "Job failed"),
                                "timestamp": datetime.now().isoformat()
                            }
                
                except Exception as e:
                    print(f"⚠️ Polling error attempt {attempt}: {e}")
                
                await asyncio.sleep(2)  # Wait 2 seconds between polls
                
                if attempt % 30 == 0:  # Progress update every minute
                    print(f"⏳ Still generating... {attempt*2}s elapsed")
            
            return {
                "topic": topic,
                "success": False,
                "duration": time.time() - start_time,
                "job_id": job_id,
                "error": "Generation timeout (10 minutes)",
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "topic": topic,
                "success": False,
                "duration": time.time() - start_time,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    async def run_test_batch(self, topics: List[str], concurrent_limit: int = 2):
        """Run batch of video generation tests with concurrency limit."""
        self.start_time = time.time()
        print(f"\n🚀 Starting batch test with {len(topics)} topics (max {concurrent_limit} concurrent)")
        print(f"📅 Test session: {self.test_session_id}")
        print(f"🌟 Topics: {', '.join(topics)}")
        
        semaphore = asyncio.Semaphore(concurrent_limit)
        
        async def limited_create(topic):
            async with semaphore:
                return await self.create_video(topic)
        
        # Run all video generations
        tasks = [limited_create(topic) for topic in topics]
        self.results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle any exceptions
        for i, result in enumerate(self.results):
            if isinstance(result, Exception):
                self.results[i] = {
                    "topic": topics[i],
                    "success": False,
                    "duration": 0,
                    "error": str(result),
                    "timestamp": datetime.now().isoformat()
                }
        
        return self.results
    
    def generate_report(self) -> Dict[str, Any]:
        """Generate comprehensive test report with metrics and analysis."""
        if not self.results:
            return {"error": "No test results available"}
        
        total_tests = len(self.results)
        successful = [r for r in self.results if r.get("success", False)]
        failed = [r for r in self.results if not r.get("success", False)]
        
        # Basic metrics
        success_rate = len(successful) / total_tests * 100
        total_duration = time.time() - self.start_time if self.start_time else 0
        
        # Duration analysis
        durations = [r.get("duration", 0) for r in self.results if r.get("duration")]
        avg_duration = sum(durations) / len(durations) if durations else 0
        min_duration = min(durations) if durations else 0
        max_duration = max(durations) if durations else 0
        
        # Quality analysis
        quality_scores = [r.get("quality_score") for r in successful if r.get("quality_score")]
        avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else 0
        
        # Cost analysis
        costs = [r.get("cost_usd", 0) for r in successful if r.get("cost_usd")]
        total_cost = sum(costs)
        avg_cost = total_cost / len(costs) if costs else 0
        
        # Error analysis
        error_types = {}
        for result in failed:
            error = result.get("error", "Unknown")
            error_type = "Network/API" if any(keyword in error for keyword in ["Cannot connect", "Network error", "DEEPSEEK"]) else \
                         "Rendering" if any(keyword in error for keyword in ["numpy", "Manim", "render"]) else \
                         "Timeout" if "timeout" in error.lower() else \
                         "Other"
            error_types[error_type] = error_types.get(error_type, 0) + 1
        
        # Video output analysis
        videos_created = len([r for r in successful if r.get("video_url")])
        audio_created = len([r for r in successful if r.get("audio_url")])
        
        report = {
            "test_session_id": self.test_session_id,
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "total_tests": total_tests,
                "successful": len(successful),
                "failed": len(failed),
                "success_rate_percent": round(success_rate, 1),
                "total_test_duration_minutes": round(total_duration / 60, 1)
            },
            "performance_metrics": {
                "avg_generation_time_minutes": round(avg_duration / 60, 1),
                "min_generation_time_minutes": round(min_duration / 60, 1),
                "max_generation_time_minutes": round(max_duration / 60, 1),
                "videos_with_output": videos_created,
                "audio_files_created": audio_created
            },
            "quality_metrics": {
                "avg_quality_score": round(avg_quality, 2),
                "quality_scores_available": len(quality_scores),
                "total_cost_usd": round(total_cost, 2),
                "avg_cost_per_video_usd": round(avg_cost, 2)
            },
            "error_analysis": {
                "error_types": error_types,
                "most_common_error": max(error_types.items(), key=lambda x: x[1])[0] if error_types else "None"
            },
            "detailed_results": self.results
        }
        
        return report
    
    def save_report(self, filename: str = None):
        """Save test report to JSON file."""
        if not filename:
            filename = f"video_generation_test_report_{self.test_session_id[:8]}.json"
        
        report = self.generate_report()
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        print(f"\n📄 Report saved: {filename}")
        return filename
    
    def print_summary(self):
        """Print a concise summary of test results."""
        report = self.generate_report()
        
        print(f"\n{'='*60}")
        print(f"🎬 VIDEO GENERATION TEST REPORT")
        print(f"{'='*60}")
        print(f"📅 Session ID: {self.test_session_id}")
        print(f"🕒 Timestamp: {report['timestamp']}")
        print()
        
        summary = report['summary']
        print(f"📊 SUMMARY:")
        print(f"   Total Tests: {summary['total_tests']}")
        print(f"   Successful: {summary['successful']} ✅")
        print(f"   Failed: {summary['failed']} ❌")
        print(f"   Success Rate: {summary['success_rate_percent']}%")
        print(f"   Total Duration: {summary['total_test_duration_minutes']} minutes")
        print()
        
        perf = report['performance_metrics']
        print(f"⚡ PERFORMANCE:")
        print(f"   Avg Generation Time: {perf['avg_generation_time_minutes']} minutes")
        print(f"   Range: {perf['min_generation_time_minutes']}-{perf['max_generation_time_minutes']} minutes")
        print(f"   Videos Created: {perf['videos_with_output']}")
        print(f"   Audio Files: {perf['audio_files_created']}")
        print()
        
        quality = report['quality_metrics']
        print(f"🏆 QUALITY & COST:")
        print(f"   Avg Quality Score: {quality['avg_quality_score']}/10")
        print(f"   Total Cost: ${quality['total_cost_usd']}")
        print(f"   Avg Cost per Video: ${quality['avg_cost_per_video_usd']}")
        print()
        
        errors = report['error_analysis']
        if errors['error_types']:
            print(f"🚨 ERROR ANALYSIS:")
            for error_type, count in errors['error_types'].items():
                print(f"   {error_type}: {count}")
            print(f"   Most Common: {errors['most_common_error']}")
        else:
            print(f"🎉 NO ERRORS DETECTED!")
        
        print(f"{'='*60}\n")


async def main():
    """Main test execution function."""
    print("🎬 MentorMind Video Generation Test Suite")
    print("=========================================")
    
    # Configuration
    num_tests = int(input("Enter number of videos to generate (default 5): ") or "5")
    concurrent_limit = int(input("Enter max concurrent generations (default 2): ") or "2")
    
    # Randomly select topics
    selected_topics = random.sample(TEST_TOPICS, min(num_tests, len(TEST_TOPICS)))
    
    # Create tester instance
    tester = VideoGenerationTester()
    
    # Run tests
    print(f"\n🚀 Starting test with {num_tests} videos...")
    await tester.run_test_batch(selected_topics, concurrent_limit)
    
    # Generate and save report
    report_file = tester.save_report()
    tester.print_summary()
    
    print(f"📁 Videos stored in: backend/data/videos/")
    print(f"📄 Full report: {report_file}")
    print(f"🌐 View metrics dashboard: http://localhost:3000/admin/metrics")


if __name__ == "__main__":
    asyncio.run(main())