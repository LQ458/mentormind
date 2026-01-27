# MentorMind Backend Service

AI-driven educational agent for the Chinese market with high-performance, low-cost architecture.

## 🎯 Overview

MentorMind is a Compound AI System that "understands, reconstructs, and teaches" educational content. Unlike traditional text summarizers, it employs multimodal perception (Vision+Audio) with a Cognitive Knowledge Graph to model pedagogical intent.

**Key Features:**
- 🇨🇳 **China Market Optimized**: Uses top-tier Chinese models (DeepSeek, Alibaba, Baidu)
- 💰 **Cost Effective**: <10% of Western model costs (~$160/month)
- 🧠 **Compound AI Architecture**: Manager-Expert system with planner-critic workflow
- 🎓 **Pedagogical Intelligence**: Understands student gaps and creates personalized lessons
- 🎥 **Multimodal Output**: Generates teaching scripts with avatar synthesis

## 🏗️ Architecture

### Backend Structure

```
backend/
├── backend_server.py          # Main FastAPI server
├── config/                    # Configuration management
│   └── config.py
├── core/                      # Core business logic
│   ├── create_classes.py      # Class creation logic
│   └── modules/              # Pipeline modules
│       ├── ingestion.py      # Audio/video processing
│       ├── cognitive.py      # Knowledge extraction
│       ├── agentic.py        # Agent workflow
│       ├── output.py         # Output generation
│       └── sophisticated_pipeline.py
├── services/                  # Real AI service integrations
│   ├── funasr/              # FunASR audio transcription
│   ├── paddleocr/           # PaddleOCR text extraction
│   └── tts/                 # Text-to-speech synthesis
├── api/                      # API clients and utilities
└── utils/                    # Utility functions
```

### Core Services

1. **FunASR Service** (`backend/services/funasr/`)
   - Real audio transcription with timestamps
   - Chinese language optimized
   - Configurable API endpoints

2. **PaddleOCR Service** (`backend/services/paddleocr/`)
   - Real text extraction from images/video
   - Chinese OCR with high accuracy
   - Frame-by-frame processing

3. **TTS Service** (`backend/services/tts/`)
   - Real text-to-speech conversion
   - Multiple language support
   - Emotion-aware synthesis

4. **Cognitive Processing** (`backend/core/modules/cognitive.py`)
   - Knowledge extraction with DeepSeek-V3
   - Graph construction with NetworkX
   - Pedagogical intent tagging

5. **Output Generation** (`backend/core/modules/output.py`)
   - Script generation
   - TTS synthesis integration
   - Avatar video generation

### Getting Started with Real Services

1. **Set up environment variables**:
```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file and add your DeepSeek API key
# Get your API key from: https://platform.deepseek.com/
# Edit .env and set: DEEPSEEK_API_KEY=your_actual_key_here

# Optional: Set AI service endpoints if you have them running
# FUNASR_API_URL, PADDLEOCR_API_URL, TTS_API_URL
```

2. **Start the backend**:
```bash
cd backend
./start.sh
```

3. **Test services**:
```bash
cd backend
python test_services.py
```

### Configuration Management

All variables controlled from single file: `backend/config/config.py`

```python
from config import config

# Access any configuration
print(config.PROJECT_NAME)  # "MentorMind"
print(config.get_models()["deepseek_v3"].cost_per_1k_tokens)  # 0.001
```

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)

```bash
# Clone repository
git clone https://github.com/yourusername/mentormind.git
cd mentormind

# Run setup script
chmod +x setup.sh
./setup.sh
```

### Option 2: Manual Setup

```bash
# Clone repository
git clone https://github.com/yourusername/mentormind.git
cd mentormind

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Create necessary directories
mkdir -p data/audio data/videos data/test logs .cache assets

# Run tests
python test_integration.py
```

### 2. Environment Variables

Create a `.env` file from `.env.example`:

```bash
# Required for DeepSeek models
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Optional for local services
FUNASR_ENDPOINT=http://localhost:8000/asr
PADDLE_OCR_ENDPOINT=http://localhost:8001/ocr
NEBULA_HOST=localhost
MILVUS_HOST=localhost
```

### 3. Run Integration Tests

```bash
python test_integration.py
```

### 4. Docker Setup (Optional)

```bash
# Build Docker image
docker build -t mentormind .

# Run container
docker run -it --env-file .env mentormind

# Or with Docker Compose
docker-compose up
```

### 5. Example Usage

```python
import asyncio
from modules.agentic import TeachingAgent
from modules.output import OutputPipeline

async def teach_student():
    # Initialize components
    agent = TeachingAgent()
    pipeline = OutputPipeline()
    
    # Student query
    query = "我不理解二次方程"
    
    # Generate lesson (simplified)
    lesson_plan, assessment, _ = await agent.teach(
        student_query=query,
        knowledge_graph={"entities": [], "relationships": []},  # Would come from cognitive module
        student_level="beginner"
    )
    
    # Generate output
    output = await pipeline.generate_teaching_output(lesson_plan.to_dict())
    
    print(f"Lesson: {lesson_plan.title}")
    print(f"Quality: {assessment.overall_score:.2f}")
    print(f"Video: {output['video']['video_path']}")

asyncio.run(teach_student())
```

## 📊 Technology Stack ("Dragon Stack")

| Component | Technology | Provider | Why This Choice |
|-----------|------------|----------|-----------------|
| Main LLM | DeepSeek-V3 | DeepSeek | 1/10th cost of GPT-4o; excels in Chinese |
| Reasoning | DeepSeek-R1 | DeepSeek | Specialized for diagnosing student logic errors |
| ASR | FunASR (Paraformer) | Alibaba DAMO | State-of-the-art Chinese recognition |
| OCR | PaddleOCR | Baidu | Best for complex Chinese textbooks |
| Knowledge Graph | NetworkX → NebulaGraph | Open Source | Graph analysis + distributed storage |
| Vector DB | Milvus | Zilliz | Leading open-source vector DB (born in China) |

## 💰 Cost Analysis

**Estimated Monthly Costs (Aliyun/Tencent Cloud):**
- Model APIs (DeepSeek): ~$50 USD (50M tokens)
- Compute (ECS GPU): ~$100 USD
- Storage (OSS): ~$10 USD
- **Total: ~$160 USD/month** (vs. ~$1500+ for Western stack)

## 🗺️ MVP Roadmap

### Week 1: Foundation
- [x] Set up configuration management
- [x] Implement core module interfaces
- [x] Create integration test suite

### Week 2: Ingestion Pipeline
- [ ] Connect FunASR API for audio processing
- [ ] Integrate PaddleOCR for slide extraction
- [ ] Implement temporal alignment engine

### Week 3: Knowledge Graph
- [ ] Connect DeepSeek-V3 for entity extraction
- [ ] Build graph construction pipeline
- [ ] Implement pedagogical tagging

### Week 4: Teaching Agent
- [ ] Integrate DeepSeek-R1 for lesson planning
- [ ] Implement quality critic
- [ ] Add regeneration with feedback

### Week 5: Output Generation
- [ ] Implement Chinese TTS synthesis
- [ ] Add avatar video generation
- [ ] Create batch processing pipeline

## 🧪 Testing

```bash
# Run all tests
python test_integration.py

# Test specific module
python -m pytest modules/test_ingestion.py -v

# Check code quality
black .
flake8 .
mypy .
```

## 🔧 Configuration

All variables are centralized in `config.py`:

```python
# Model configurations
config.get_models()["deepseek_v3"].api_key = os.getenv("DEEPSEEK_API_KEY")

# Database configurations
config.get_databases()["nebula_graph"].host = "localhost"

# Processing settings
config.PROCESSING.mode = ProcessingMode.HYBRID

# Cost optimization
config.COST_OPTIMIZATION.monthly_budget_usd = 160.0
```

## 🚨 Validation

The configuration system includes validation:

```python
warnings = config.validate_config()
if warnings:
    for warning in warnings:
        print(f"Warning: {warning}")
```

## 📁 Project Structure

```
mentormind/
├── config.py              # ✅ Centralized configuration (all variables here)
├── requirements.txt       # ✅ Chinese-optimized dependencies
├── test_integration.py   # ✅ Complete integration tests
├── example.py            # ✅ Example demonstration
├── setup.sh              # ✅ Automated setup script
├── Dockerfile            # ✅ Container configuration
├── .env.example          # ✅ Environment template
├── .gitignore           # ✅ Git ignore rules
├── README.md            # ✅ Comprehensive documentation
│
├── modules/              # ✅ All core modules
│   ├── ingestion.py      # ✅ Multimodal ingestion
│   ├── cognitive.py      # ✅ Cognitive processing  
│   ├── agentic.py        # ✅ Agentic workflow
│   └── output.py         # ✅ Output generation
│
├── data/                 # ✅ Data directories (auto-created)
│   ├── audio/           # ✅ Generated audio files
│   ├── videos/          # ✅ Generated videos
│   └── test/            # ✅ Test data
│
├── assets/              # ✅ Asset files (auto-created)
├── logs/                # ✅ Log files (auto-created)
└── .cache/              # ✅ Cache directory (auto-created)
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- DeepSeek for their excellent Chinese LLMs
- Alibaba DAMO for FunASR
- Baidu for PaddleOCR
- The open-source AI education community

---

**MentorMind**: Understanding, Reconstructing, and Teaching for the Chinese Education Market.