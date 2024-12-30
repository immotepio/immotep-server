# Utiliser une image Node.js officielle comme base
# Choisir la version LTS (Long Term Support)
FROM node:18

# Définir le répertoire de travail dans le conteneur
WORKDIR /app

# Copier les fichiers de dépendances
# Copier package.json ET package-lock.json
COPY package*.json ./

# Installer les dépendances du projet
RUN npm install

# Copier tous les autres fichiers du projet
COPY . .

# Exposer le port sur lequel l'application va tourner
EXPOSE 3000

# Commande pour démarrer l'application
CMD ["node", "server.js"]