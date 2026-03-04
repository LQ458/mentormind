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
    tipa \
    libcairo2-dev \
    libpango1.0-dev \
    pkg-config \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create data directories
RUN mkdir -p /app/data
RUN mkdir -p /app/config/data/videos/manim
RUN mkdir -p /app/config/data/videos/remotion
RUN mkdir -p /app/config/data/audio

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "server.py"]