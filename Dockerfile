FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy server code and assets
COPY server ./server

EXPOSE 8787

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

CMD ["node", "server/index.js"]
