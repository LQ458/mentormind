# Create Classes Function - English + Chinese Version

## Overview

The `create_classes` module provides a comprehensive solution for creating educational classes/lessons in both English and Chinese languages. It integrates with MentorMind's existing AI pipeline to generate personalized teaching content.

## Features

- **Dual Language Support**: Create classes in English, Chinese, or both languages simultaneously
- **Intelligent Content Generation**: Uses DeepSeek AI models for lesson planning and content creation
- **Quality Assessment**: Includes automatic quality scoring and feedback
- **Multimedia Output**: Supports video, audio, and script generation
- **Cost Tracking**: Monitors and reports generation costs
- **REST API**: Fully integrated with FastAPI backend

## File Structure

```
create_classes.py          # Main implementation with ClassCreator class
test_create_classes.py     # Test suite for functionality
CREATE_CLASSES_README.md   # This documentation
```

## Core Components

### 1. ClassCreator Class
Main class that handles class creation in multiple languages.

**Key Methods:**
- `create_class_english()`: Create English classes
- `create_class_chinese()`: Create Chinese classes  
- `create_class_bilingual()`: Create both English and Chinese versions
- `get_language_support_info()`: Get supported languages

### 2. Data Classes
- `ClassCreationRequest`: Input parameters for class creation
- `ClassCreationResult`: Output with lesson plan, quality assessment, and metadata
- `Language`: Enum for supported languages (ENGLISH, CHINESE, JAPANESE, KOREAN)

## API Endpoints

### Backend Server Integration

The functionality is integrated into the FastAPI backend with these endpoints:

#### 1. Create Single Language Class
```
POST /create-class
Content-Type: application/json

{
  "topic": "Python programming",
  "language": "en",  // "en" or "zh"
  "studentLevel": "beginner",
  "durationMinutes": 45,
  "includeVideo": true,
  "includeExercises": true,
  "includeAssessment": true
}
```

#### 2. Create Bilingual Class
```
POST /create-class-bilingual
Content-Type: application/json

{
  "topic": "Machine Learning",
  "studentLevel": "intermediate",
  "durationMinutes": 60,
  "includeVideo": true
}
```

#### 3. Get Language Support
```
GET /languages
```

Returns:
```json
{
  "supported_languages": [
    {"code": "en", "name": "English", "native_name": "English"},
    {"code": "zh", "name": "Chinese", "native_name": "中文"},
    {"code": "ja", "name": "Japanese", "native_name": "日本語"},
    {"code": "ko", "name": "Korean", "native_name": "한국어"}
  ],
  "default_language": "zh",
  "bilingual_support": true
}
```

## Usage Examples

### Python Code Examples

```python
from create_classes import ClassCreator, ClassCreationRequest, Language
import asyncio

async def create_english_class():
    creator = ClassCreator()
    
    request = ClassCreationRequest(
        topic="Python programming basics",
        language=Language.ENGLISH,
        student_level="beginner",
        duration_minutes=45,
        include_video=True
    )
    
    result = await creator.create_class_english(request)
    
    if result.success:
        print(f"Title: {result.lesson_plan.title}")
        print(f"Quality: {result.quality_assessment.overall_score:.2f}")
        print(f"Cost: ${result.cost_usd:.4f}")

async def create_bilingual_class():
    creator = ClassCreator()
    
    request = ClassCreationRequest(
        topic="Machine Learning fundamentals",
        language=Language.ENGLISH,
        student_level="intermediate",
        duration_minutes=60
    )
    
    results = await creator.create_class_bilingual(request)
    
    # Access English and Chinese results
    english = results["english"]
    chinese = results["chinese"]

# Run examples
asyncio.run(create_english_class())
```

### Command Line Examples

1. **Run interactive examples:**
```bash
python create_classes.py
```

2. **Run tests:**
```bash
python test_create_classes.py
```

3. **Start backend server:**
```bash
python backend_server.py
```

4. **Test API with curl:**
```bash
# Create English class
curl -X POST http://localhost:8000/create-class \
  -H "Content-Type: application/json" \
  -d '{"topic": "Python programming", "language": "en", "studentLevel": "beginner"}'

# Create Chinese class  
curl -X POST http://localhost:8000/create-class \
  -H "Content-Type: application/json" \
  -d '{"topic": "Python编程", "language": "zh", "studentLevel": "初学者"}'

# Create bilingual class
curl -X POST http://localhost:8000/create-class-bilingual \
  -H "Content-Type: application/json" \
  -d '{"topic": "Machine Learning", "studentLevel": "intermediate"}'
```

## Language-Specific Features

### English Version
- Uses English prompts for DeepSeek models
- Generates content with Western teaching style
- Includes English terminology and examples
- Optimized for international students

### Chinese Version
- Uses Chinese prompts for DeepSeek models
- Generates content with Chinese teaching methodology
- Includes Chinese cultural references and examples
- Optimized for Chinese education market

### Bilingual Mode
- Creates parallel content in both languages
- Maintains consistency in teaching structure
- Allows comparison of teaching approaches
- Useful for language learning contexts

## Integration with Existing System

The create classes function integrates with:

1. **Cognitive Processing** (`modules/cognitive.py`): For knowledge extraction
2. **Teaching Agent** (`modules/agentic.py`): For lesson planning
3. **Output Pipeline** (`modules/output.py`): For content generation
4. **API Client** (`api_client.py`): For external service connections
5. **Configuration** (`config.py`): For model and cost settings

## Output Structure

Each class creation returns a `ClassCreationResult` with:

```python
{
    "success": bool,                    # Whether creation was successful
    "lesson_plan": LessonPlan,          # Complete lesson structure
    "quality_assessment": QualityAssessment,  # Quality scores and feedback
    "output_result": dict,              # Generated content (script, audio, video)
    "cost_usd": float,                  # Generation cost in USD
    "processing_time_seconds": float,   # Time taken to generate
    "language_used": Language,          # Language of generated content
    "error_message": str                # Error message if failed
}
```

## Error Handling

The system includes comprehensive error handling:

1. **API Connection Errors**: Falls back to mock data when APIs unavailable
2. **Invalid Input**: Validates all input parameters
3. **Processing Errors**: Returns detailed error messages
4. **Quality Thresholds**: Rejects low-quality content automatically

## Testing

Run the test suite to verify functionality:

```bash
# Run all tests
python test_create_classes.py

# Test specific functionality
python -c "
import asyncio
from create_classes import ClassCreator
creator = ClassCreator()
print(creator.get_language_support_info())
"
```

## Configuration

Ensure proper configuration in `.env` file:

```bash
# Required for DeepSeek models
DEEPSEEK_API_KEY=your_api_key_here

# Optional for full functionality
FUNASR_ENDPOINT=http://localhost:8000/asr
PADDLE_OCR_ENDPOINT=http://localhost:8001/ocr
```

## Performance Considerations

- **Cost Optimization**: Uses cost-effective Chinese AI models
- **Caching**: Implements caching for repeated queries
- **Parallel Processing**: Runs English and Chinese generation in parallel
- **Quality Control**: Includes automatic quality assessment

## Future Enhancements

Planned features:
1. Additional language support (Japanese, Korean)
2. Advanced customization options
3. Batch processing for multiple classes
4. Integration with learning management systems
5. Student progress tracking

## Support

For issues or questions:
1. Check API key configuration
2. Verify network connectivity
3. Review error messages in logs
4. Test with example queries first

## License

Part of the MentorMind project - MIT License