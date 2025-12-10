# frontend/Dockerfile
FROM node:20-alpine

RUN npm install -g pnpm

# Définir le répertoire de travail
WORKDIR /app

# Copier package.json et package-lock.json
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Installer les dépendances
RUN pnpm install

# Copier le reste du code
COPY . .

# Exposer le port
EXPOSE 5173

# Commande de démarrage (dev mode)
CMD ["npm","pnpm", "run", "dev", "--", "--host", "0.0.0.0"]