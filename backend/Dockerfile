FROM python:3.11-slim

# System deps: git (repo cloning), Node.js (preview renderer), Playwright browser deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 \
  && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 (needed for npx next dev in preview renderer)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

# esbuild is used by app/services/js_parser_validator.py to parse-check
# model-generated TSX before we hand it to the Next.js dev server. Global
# install keeps it on PATH as a standalone binary.
RUN npm install -g esbuild@0.25.0

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium
RUN playwright install chromium

COPY . .

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
