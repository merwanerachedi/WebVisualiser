# frontend/Dockerfile
FROM node:20-alpine

# Définir le répertoire de travail
WORKDIR /app

# Copier package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances
RUN npm install

# Copier le reste du code
COPY . .

# Exposer le port
EXPOSE 5173

# Commande de démarrage (dev mode)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]