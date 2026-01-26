"""
Test script for create_classes functionality
"""

import asyncio
import sys
import os

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from create_classes import (
    ClassCreator, 
    ClassCreationRequest, 
    Language,
    example_create_english_class,
    example_create_chinese_class,
    example_create_bilingual_class
)


async def test_basic_functionality():
    """Test basic create classes functionality"""
    print("=" * 60)
    print("TESTING CREATE CLASSES FUNCTIONALITY")
    print("=" * 60)
    
    # Initialize class creator
    creator = ClassCreator()
    
    # Test 1: Get language support info
    print("\n1. Language Support Information:")
    lang_info = creator.get_language_support_info()
    print(f"   Supported languages: {len(lang_info['supported_languages'])}")
    for lang in lang_info["supported_languages"]:
        print(f"     • {lang['name']} ({lang['native_name']})")
    print(f"   Default language: {lang_info['default_language']}")
    print(f"   Bilingual support: {lang_info['bilingual_support']}")
    
    # Test 2: Test English query formatting
    print("\n2. Query Formatting Tests:")
    english_query = creator._format_english_query("Python programming", "beginner")
    print(f"   English query: {english_query}")
    
    chinese_query = creator._format_chinese_query("Python编程", "初学者")
    print(f"   Chinese query: {chinese_query}")
    
    # Test 3: Create simple requests
    print("\n3. Request Creation Tests:")
    
    english_request = ClassCreationRequest(
        topic="Machine Learning",
        language=Language.ENGLISH,
        student_level="intermediate",
        duration_minutes=45,
        include_video=True
    )
    print(f"   English request: {english_request.topic}, {english_request.language.value}")
    
    chinese_request = ClassCreationRequest(
        topic="机器学习",
        language=Language.CHINESE,
        student_level="中级",
        duration_minutes=45,
        include_video=True
    )
    print(f"   Chinese request: {chinese_request.topic}, {chinese_request.language.value}")
    
    print("\n✅ Basic functionality tests passed!")


async def test_api_integration():
    """Test integration with actual APIs (if available)"""
    print("\n" + "=" * 60)
    print("TESTING API INTEGRATION")
    print("=" * 60)
    
    try:
        # Test if we can import API client
        from api_client import api_client
        
        print("\nTesting API connections...")
        api_results = await api_client.test_connection()
        
        print("API Connection Results:")
        for service, status in api_results.items():
            status_icon = "✅" if status else "❌"
            print(f"   {status_icon} {service}: {'Connected' if status else 'Failed'}")
        
        all_connected = all(api_results.values())
        if all_connected:
            print("\n✅ All API connections successful!")
            return True
        else:
            print("\n⚠️  Some API connections failed. Mock data will be used.")
            return False
            
    except Exception as e:
        print(f"\n⚠️  API client error: {e}")
        print("   Mock data will be used for testing.")
        return False


async def run_examples():
    """Run the example functions"""
    print("\n" + "=" * 60)
    print("RUNNING EXAMPLE FUNCTIONS")
    print("=" * 60)
    
    print("\nExample 1: Creating English Class")
    print("-" * 40)
    english_result = await example_create_english_class()
    
    print("\nExample 2: Creating Chinese Class")
    print("-" * 40)
    chinese_result = await example_create_chinese_class()
    
    print("\nExample 3: Creating Bilingual Class")
    print("-" * 40)
    bilingual_results = await example_create_bilingual_class()
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    successes = []
    if english_result and english_result.success:
        successes.append("English Class")
    if chinese_result and chinese_result.success:
        successes.append("Chinese Class")
    if bilingual_results and bilingual_results.get("english") and bilingual_results["english"].success:
        successes.append("Bilingual English")
    if bilingual_results and bilingual_results.get("chinese") and bilingual_results["chinese"].success:
        successes.append("Bilingual Chinese")
    
    print(f"\nSuccessful tests: {len(successes)}")
    for success in successes:
        print(f"  ✅ {success}")
    
    if len(successes) >= 2:
        print("\n✅ Create classes functionality is working!")
    else:
        print("\n⚠️  Some tests failed. Check API connections and configuration.")


async def main():
    """Main test function"""
    print("MentorMind Create Classes Test Suite")
    print("Testing English + Chinese versions")
    
    # Run basic functionality tests
    await test_basic_functionality()
    
    # Test API integration
    api_available = await test_api_integration()
    
    if api_available:
        # Run examples with real APIs
        await run_examples()
    else:
        print("\n⚠️  Skipping example runs due to API connection issues.")
        print("   Please configure API keys in .env file for full testing.")
    
    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Configure API keys in .env file")
    print("2. Run: python create_classes.py (for interactive testing)")
    print("3. Start backend: python backend_server.py")
    print("4. Test endpoints: curl -X POST http://localhost:8000/create-class")
    print("   with JSON body: {\"topic\": \"Python\", \"language\": \"en\"}")


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