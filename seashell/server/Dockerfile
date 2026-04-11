# Node 22+ (нужен встроенный node:sqlite)
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3001
# При монтировании тома в /data база переживёт перезапуски
ENV DATA_DIR=/data

EXPOSE 3001

CMD ["node", "index.js"]
