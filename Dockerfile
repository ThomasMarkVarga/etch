FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
EXPOSE 8765
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "8765"]
