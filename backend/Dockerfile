FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY public ./public
ENV HOST=0.0.0.0 PORT=4310
EXPOSE 4310
CMD ["node","--import","tsx","src/server.ts"]
