#!/usr/bin/env python3
"""
Test script: Generate 10 lessons via the /create-class API and evaluate results.
Runs against the local Docker backend on port 8000.
"""

import requests
import time
import json
import sys
from datetime import datetime

BASE_URL = "http://localhost:8000"

TOPICS = [
    {"topic": "Quadratic functions", "language": "en", "student_level": "beginner"},
    {"topic": "Pythagorean theorem", "language": "en", "student_level": "beginner"},
    {"topic": "Derivatives and differentiation", "language": "en", "student_level": "intermediate"},
    {"topic": "Linear algebra basics", "language": "en", "student_level": "beginner"},
    {"topic": "Probability fundamentals", "language": "en", "student_level": "beginner"},
    {"topic": "二次方程", "language": "zh", "student_level": "beginner"},
    {"topic": "Trigonometric identities", "language": "en", "student_level": "intermediate"},
    {"topic": "Newton's laws of motion", "language": "en", "student_level": "beginner"},
    {"topic": "Chemical bonding", "language": "en", "student_level": "beginner"},
    {"topic": "Integration techniques", "language": "en", "student_level": "advanced"},
]

def create_lesson(topic_config):
    """Submit a lesson creation request."""
    payload = {
        "topic": topic_config["topic"],
        "language": topic_config["language"],
        "student_level": topic_config["student_level"],
        "duration_minutes": 10,
        "include_video": True,
        "include_exercises": False,
        "include_assessment": False,
        "voice_id": "anna",
    }
    try:
        resp = requests.post(f"{BASE_URL}/create-class", json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data.get("job_id")
    except Exception as e:
        print(f"  ❌ Failed to submit: {e}")
        return None


def poll_job(job_id, timeout=600):
    """Poll job status until complete or timeout."""
    start = time.time()
    last_progress = ""
    while time.time() - start < timeout:
        try:
            resp = requests.get(f"{BASE_URL}/job-status/{job_id}", timeout=10)
            data = resp.json()
            status = data.get("status", "unknown")
            progress = data.get("progress", "")

            if progress != last_progress:
                print(f"    [{job_id[:12]}] {status} — {progress}")
                last_progress = progress

            if status == "completed":
                return {"status": "completed", "data": data}
            elif status == "failed":
                return {"status": "failed", "error": data.get("error", "unknown")}

        except Exception as e:
            print(f"    [{job_id[:12]}] poll error: {e}")

        time.sleep(10)

    return {"status": "timeout"}


def main():
    print(f"{'='*60}")
    print(f"MentorMind Lesson Generation Test — {datetime.now().isoformat()}")
    print(f"{'='*60}")

    # Health check
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"✅ Backend healthy: {resp.status_code}")
    except Exception as e:
        print(f"❌ Backend not reachable: {e}")
        sys.exit(1)

    results = []

    # Submit all lessons sequentially (they run async in Celery)
    job_ids = []
    for i, topic_config in enumerate(TOPICS):
        print(f"\n[{i+1}/10] Submitting: {topic_config['topic']} ({topic_config['language']})")
        job_id = create_lesson(topic_config)
        if job_id:
            print(f"  ✅ Job ID: {job_id}")
            job_ids.append((i, topic_config, job_id))
        else:
            results.append({
                "index": i,
                "topic": topic_config["topic"],
                "language": topic_config["language"],
                "status": "submit_failed",
                "error": "Failed to submit job",
            })
        # Small delay between submissions
        time.sleep(2)

    print(f"\n{'='*60}")
    print(f"Submitted {len(job_ids)}/10 jobs. Polling for results...")
    print(f"{'='*60}")

    # Poll all jobs
    for i, topic_config, job_id in job_ids:
        print(f"\n[{i+1}/10] Waiting: {topic_config['topic']}")
        result = poll_job(job_id, timeout=600)
        result_entry = {
            "index": i,
            "topic": topic_config["topic"],
            "language": topic_config["language"],
            "job_id": job_id,
            "status": result["status"],
        }
        if result["status"] == "completed":
            data = result.get("data", {})
            # The /job-status endpoint nests the pipeline result under "result"
            pipeline_result = data.get("result", data)
            result_entry["video_url"] = pipeline_result.get("video_url", "")
            quality_eval = pipeline_result.get("quality_evaluation", {})
            result_entry["quality_score"] = quality_eval.get("overall_score", "")
            result_entry["quality_grade"] = quality_eval.get("grade", "")
            result_entry["duration_seconds"] = pipeline_result.get("duration_seconds", "")
            grade_str = f" (Grade: {result_entry['quality_grade']})" if result_entry['quality_grade'] else ""
            print(f"  ✅ Completed — video: {result_entry['video_url']}{grade_str}")
        elif result["status"] == "failed":
            result_entry["error"] = result.get("error", "unknown")
            print(f"  ❌ Failed: {result_entry['error']}")
        else:
            print(f"  ⏰ Timeout")

        results.append(result_entry)

    # Summary
    print(f"\n{'='*60}")
    print("RESULTS SUMMARY")
    print(f"{'='*60}")

    completed = sum(1 for r in results if r["status"] == "completed")
    failed = sum(1 for r in results if r["status"] == "failed")
    timed_out = sum(1 for r in results if r["status"] == "timeout")
    submit_failed = sum(1 for r in results if r["status"] == "submit_failed")

    print(f"✅ Completed: {completed}/10")
    print(f"❌ Failed: {failed}/10")
    print(f"⏰ Timed out: {timed_out}/10")
    print(f"🚫 Submit failed: {submit_failed}/10")

    # Quality summary
    graded = [r for r in results if r.get("quality_grade")]
    if graded:
        print(f"\nQuality Grades:")
        for r in graded:
            print(f"  {r['quality_grade']}: {r['topic']} (score: {r.get('quality_score', '?')})")
        grade_counts = {}
        for r in graded:
            g = r['quality_grade']
            grade_counts[g] = grade_counts.get(g, 0) + 1
        print(f"  Distribution: {', '.join(f'{g}={c}' for g, c in sorted(grade_counts.items()))}")

    if failed > 0:
        print(f"\nFailed lessons:")
        for r in results:
            if r["status"] == "failed":
                print(f"  - {r['topic']}: {r.get('error', 'unknown')}")

    # Save full results
    output_path = f"test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nFull results saved to: {output_path}")

    return results


if __name__ == "__main__":
    main()
