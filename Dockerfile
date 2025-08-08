# Use official Playwright image with browsers preinstalled
FROM mcr.microsoft.com/playwright:focal

# Install curl (should be present, but just in case)
RUN apt-get update && apt-get install -y curl

# Install Bun runtime
RUN curl -fsSL https://bun.sh/install | bash

ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install

COPY . .

RUN bun run playwright install --with-deps chromium

# Expose port
EXPOSE 3001


CMD ["bun", "run", "start"]
