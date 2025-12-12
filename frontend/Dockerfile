# frontend/Dockerfile
FROM node:20-alpine

RUN npm install -g pnpm

# Définir le répertoire de travail
WORKDIR /app

# 1. COPIE OPTIMISÉE : On copie d'abord les fichiers de dépendances
# Cela permet à Docker de mettre en cache l'installation si ces fichiers ne changent pas
COPY package.json pnpm-lock.yaml ./

# 2. INSTALLATION
RUN pnpm install

# 3. COPIE DU CODE SOURCE
COPY . .

# 4. PORT CORRECT
# Next.js utilise le port 3000 par défaut. 
# (5173 est pour Vite/React pur, mais ici vous avez next-env.d.ts)
EXPOSE 3000

# 5. COMMANDE DE DÉMARRAGE CORRIGÉE
# Votre ancienne commande ["npm", "pnpm"...] était incorrecte.
# On lance directement pnpm.
CMD ["pnpm", "run", "dev"]