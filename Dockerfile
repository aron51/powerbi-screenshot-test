FROM mcr.microsoft.com/playwright:latest

RUN apt-get update && apt-get install -y curl unzip --no-install-recommends && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash

ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --production

COPY . .

EXPOSE 3001

CMD ["bun", "run", "start"]
