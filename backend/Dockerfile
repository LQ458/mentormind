FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
# Manim requires ffmpeg, texlive, cairo, and pango.
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    postgresql-client \
    ffmpeg \
    texlive \
    texlive-latex-extra \
    texlive-fonts-extra \
    texlive-latex-recommended \
    texlive-science \
    texlive-lang-chinese \
    texlive-xetex \
    fonts-noto-cjk \
    tipa \
    libcairo2-dev \
    libpango1.0-dev \
    pkg-config \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
# Install torch CPU-only first (smaller, ~200MB vs 700MB+ GPU)
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create data directories (matches volume mount ./backend/data:/app/data)
RUN mkdir -p /app/data/videos/manim \
    && mkdir -p /app/data/audio

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "server.py"]