FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

RUN mkdir -p /app/sessions/videos

COPY config/omnibrowser.yaml /app/config/omnibrowser.yaml

ENTRYPOINT ["node", "dist/index.js"]
