"""
Example Usage of Create Classes Function
Shows how to use English and Chinese versions
"""

import asyncio
import sys
import os

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from create_classes import ClassCreator, ClassCreationRequest, Language


async def example_simple_usage():
    """Simple example showing basic usage"""
    print("=" * 60)
    print("SIMPLE USAGE EXAMPLE")
    print("=" * 60)
    
    # Initialize the class creator
    creator = ClassCreator()
    
    # Example 1: Create an English class
    print("\n1. Creating English Class:")
    print("-" * 40)
    
    english_request = ClassCreationRequest(
        topic="Introduction to Artificial Intelligence",
        language=Language.ENGLISH,
        student_level="beginner",
        duration_minutes=30,
        include_video=True
    )
    
    english_result = await creator.create_class_english(english_request)
    
    if english_result.success:
        print(f"   ✅ Success! Title: {english_result.lesson_plan.title}")
        print(f"   📊 Quality score: {english_result.quality_assessment.overall_score:.2f}/1.0")
        print(f"   💰 Cost: ${english_result.cost_usd:.4f}")
        print(f"   ⏱️  Processing time: {english_result.processing_time_seconds:.1f}s")
    else:
        print(f"   ❌ Failed: {english_result.error_message}")
    
    # Example 2: Create a Chinese class
    print("\n2. Creating Chinese Class:")
    print("-" * 40)
    
    chinese_request = ClassCreationRequest(
        topic="人工智能入门",
        language=Language.CHINESE,
        student_level="初学者",
        duration_minutes=30,
        include_video=True
    )
    
    chinese_result = await creator.create_class_chinese(chinese_request)
    
    if chinese_result.success:
        print(f"   ✅ 成功！标题: {chinese_result.lesson_plan.title}")
        print(f"   📊 质量评分: {chinese_result.quality_assessment.overall_score:.2f}/1.0")
        print(f"   💰 成本: ${chinese_result.cost_usd:.4f}")
        print(f"   ⏱️  处理时间: {chinese_result.processing_time_seconds:.1f}s")
    else:
        print(f"   ❌ 失败: {chinese_result.error_message}")
    
    return english_result, chinese_result


async def example_bilingual_usage():
    """Example showing bilingual class creation"""
    print("\n" + "=" * 60)
    print("BILINGUAL USAGE EXAMPLE")
    print("=" * 60)
    
    creator = ClassCreator()
    
    # Create a bilingual class (both English and Chinese)
    print("\nCreating Bilingual Class (English + Chinese):")
    print("-" * 40)
    
    request = ClassCreationRequest(
        topic="Data Science Fundamentals",
        language=Language.ENGLISH,  # Base language
        student_level="intermediate",
        duration_minutes=45,
        include_video=True
    )
    
    results = await creator.create_class_bilingual(request)
    
    english = results["english"]
    chinese = results["chinese"]
    
    print("\nEnglish Version:")
    if english.success:
        print(f"   ✅ Title: {english.lesson_plan.title}")
        print(f"   📊 Quality: {english.quality_assessment.overall_score:.2f}")
    else:
        print(f"   ❌ Failed: {english.error_message}")
    
    print("\nChinese Version:")
    if chinese.success:
        print(f"   ✅ 标题: {chinese.lesson_plan.title}")
        print(f"   📊 质量: {chinese.quality_assessment.overall_score:.2f}")
    else:
        print(f"   ❌ 失败: {chinese.error_message}")
    
    return results


async def example_custom_requirements():
    """Example with custom requirements"""
    print("\n" + "=" * 60)
    print("CUSTOM REQUIREMENTS EXAMPLE")
    print("=" * 60)
    
    creator = ClassCreator()
    
    # Create class with custom requirements
    request = ClassCreationRequest(
        topic="Web Development",
        language=Language.ENGLISH,
        student_level="beginner",
        duration_minutes=40,
        include_video=True,
        custom_requirements="Focus on practical projects, include HTML/CSS/JavaScript basics, add real-world examples",
        target_audience="college students",
        difficulty_level="beginner"
    )
    
    result = await creator.create_class_english(request)
    
    if result.success:
        print(f"\n✅ Custom class created successfully!")
        print(f"   Title: {result.lesson_plan.title}")
        print(f"   Target audience: {result.lesson_plan.target_audience}")
        print(f"   Difficulty: {result.lesson_plan.difficulty_level}")
        print(f"   Steps: {len(result.lesson_plan.steps)} teaching steps")
    else:
        print(f"\n❌ Failed: {result.error_message}")
    
    return result


def display_language_support():
    """Display language support information"""
    print("=" * 60)
    print("LANGUAGE SUPPORT INFORMATION")
    print("=" * 60)
    
    creator = ClassCreator()
    lang_info = creator.get_language_support_info()
    
    print(f"\nSupported Languages ({len(lang_info['supported_languages'])}):")
    for lang in lang_info["supported_languages"]:
        print(f"  • {lang['name']} ({lang['native_name']}) - code: {lang['code']}")
    
    print(f"\nDefault language: {lang_info['default_language']}")
    print(f"Bilingual support: {lang_info['bilingual_support']}")
    print(f"Translation available: {lang_info['translation_available']}")


async def main():
    """Main example function"""
    print("MentorMind Create Classes - Example Usage")
    print("English + Chinese Version")
    
    # Display language support
    display_language_support()
    
    # Run examples
    print("\n" + "=" * 60)
    print("RUNNING EXAMPLES")
    print("=" * 60)
    
    # Example 1: Simple usage
    english_result, chinese_result = await example_simple_usage()
    
    # Example 2: Bilingual usage
    bilingual_results = await example_bilingual_usage()
    
    # Example 3: Custom requirements
    custom_result = await example_custom_requirements()
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
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
    if custom_result and custom_result.success:
        successes.append("Custom Class")
    
    print(f"\nSuccessful examples: {len(successes)}")
    for success in successes:
        print(f"  ✅ {success}")
    
    print("\n" + "=" * 60)
    print("NEXT STEPS")
    print("=" * 60)
    print("\nTo use this functionality:")
    print("1. Configure API keys in .env file")
    print("2. Import ClassCreator from create_classes")
    print("3. Create ClassCreationRequest with your parameters")
    print("4. Call create_class_english() or create_class_chinese()")
    print("5. Or use create_class_bilingual() for both languages")
    print("\nAPI endpoints available at:")
    print("  POST /create-class")
    print("  POST /create-class-bilingual")
    print("  GET /languages")


if __name__ == "__main__":
    # Create necessary directories
    os.makedirs("data/audio", exist_ok=True)
    os.makedirs("data/videos", exist_ok=True)
    os.makedirs("data/test", exist_ok=True)
    os.makedirs("logs", exist_ok=True)
    os.makedirs(".cache", exist_ok=True)
    os.makedirs("assets", exist_ok=True)
    os.makedirs("results", exist_ok=True)
    
    # Run examples
    asyncio.run(main())