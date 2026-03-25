FROM node:20-alpine AS base
WORKDIR /app

# Dépendances de production uniquement
FROM base AS deps
COPY package*.json ./
RUN npm ci --omit=dev

# Image finale
FROM base AS runner
ENV NODE_ENV=production

# Copie des dépendances
COPY --from=deps /app/node_modules ./node_modules

# Copie du code source (sans uploads ni node_modules grâce au .dockerignore)
COPY . .

# Répertoire uploads persistant (monté via volume en prod)
RUN mkdir -p uploads

EXPOSE 5000
CMD ["node", "server.js"]
