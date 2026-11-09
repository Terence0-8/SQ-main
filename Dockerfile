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

# Copie du code source
COPY . .

# Minification CSS au build (sans dépendances externes)
RUN node scripts/minify-css.js

# Répertoire temporaire uploads avec permissions utilisateur non-root node
RUN mkdir -p uploads && chown -R node:node /app

USER node

EXPOSE 5000
CMD ["node", "server.js"]
