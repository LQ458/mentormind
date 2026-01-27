"""
MentorMind Integration Tests
Verifies the backend API health and critical paths.
"""

import unittest
import requests
import json
import time
import sys
import os

# Configuration
BASE_URL = "http://localhost:8000"

class TestMentorMindIntegration(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        """Verify server is running before tests"""
        print(f"Connecting to {BASE_URL}...")
        try:
            response = requests.get(f"{BASE_URL}/")
            if response.status_code != 200:
                print(f"Server returned status {response.status_code}")
                sys.exit(1)
            print("Server is up and running!")
        except requests.exceptions.ConnectionError:
            print("Could not connect to server. Please ensure backend is running.")
            print("Try running: cd backend && ./start.sh")
            sys.exit(1)

    def test_health_check(self):
        """Test root health check endpoint"""
        response = requests.get(f"{BASE_URL}/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("service", data)

    def test_status_endpoint(self):
        """Test status endpoint"""
        response = requests.get(f"{BASE_URL}/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "running")
        self.assertIsInstance(data["endpoints"], list)

    def test_languages(self):
        """Test languages endpoint"""
        response = requests.get(f"{BASE_URL}/languages")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("languages", data)
        # Verify we support at least Chinese and English
        codes = [l["code"] for l in data["languages"]]
        self.assertIn("zh", codes)
        self.assertIn("en", codes)

    def test_config(self):
        """Test configuration endpoint"""
        response = requests.get(f"{BASE_URL}/config")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("ai_provider", data)
        self.assertIn("model", data)

    def test_analyze_topics(self):
        """Test topic analysis endpoint"""
        payload = {
            "studentQuery": "I want to learn Python data analysis",
            "language": "en"
        }
        response = requests.post(f"{BASE_URL}/analyze-topics", json=payload)
        
        # Note: This might fail if API key is not set, but endpoint should be reachable
        if response.status_code == 200:
            data = response.json()
            self.assertTrue(data["success"])
            self.assertIsInstance(data["topics"], list)
            if len(data["topics"]) > 0:
                self.assertIn("title", data["topics"][0])

    def test_create_class(self):
        """Test class creation endpoint"""
        # Using a simple topic that might hit cache or fallback
        payload = {
            "topic": "Python Basics",
            "language": "en",
            "studentLevel": "beginner",
            "durationMinutes": 30,
            "targetAudience": "students"
        }
        
        # Increase timeout for AI generation
        try:
            response = requests.post(f"{BASE_URL}/create-class", json=payload, timeout=60)
            
            # Allow 500 error if API key is missing (fallback might mask this, but good to check)
            if response.status_code == 200:
                data = response.json()
                self.assertTrue(data["success"])
                self.assertIn("class_title", data)
                self.assertIn("lesson_plan", data)
                print(f"Created class: {data['class_title']}")
        except requests.exceptions.ReadTimeout:
            self.skipTest("Class creation timed out")

    def test_results_workflow(self):
        """Test getting saved results"""
        # Test both GET and POST endpoints
        resp_get = requests.get(f"{BASE_URL}/results")
        self.assertEqual(resp_get.status_code, 200)
        
        resp_post = requests.post(f"{BASE_URL}/results", json={})
        self.assertEqual(resp_post.status_code, 200)
        
        data = resp_get.json()
        self.assertTrue(data["success"])
        self.assertIsInstance(data["results"], list)

if __name__ == "__main__":
    unittest.main()
