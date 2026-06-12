# Step 1: Build the React frontend
FROM node:20-alpine AS client-builder
WORKDIR /app
COPY client/package*.json ./client/
RUN npm install --prefix client
COPY client/ ./client/
RUN npm run build --prefix client

# Step 2: Set up the production server environment
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

# Copy packages config and install production dependencies
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm install --omit=dev

# Copy server codebase and client built assets
COPY server/ ./server/
COPY --from=client-builder /app/client/dist ./client/dist

# Expose port and configure environment
EXPOSE 5174
ENV PORT=5174
ENV NODE_ENV=production

# Start application
CMD ["npm", "start"]
