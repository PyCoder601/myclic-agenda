# ==== Stage 1: Build ====
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY .. .

COPY .env .env.local

RUN npm run build

# ==== Stage 2: Production ====
FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /app/.next/standalone ./

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

# La commande pour démarrer le serveur standalone est `node server.js`.
CMD ["node", "server.js"]