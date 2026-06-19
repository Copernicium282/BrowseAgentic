FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

RUN mkdir -p /app/sessions/videos /app/sessions/cache /app/sessions/profiles /app/sessions/overflow

COPY config/browseagentic.yaml /app/config/browseagentic.yaml

ENTRYPOINT ["node", "dist/index.js"]
