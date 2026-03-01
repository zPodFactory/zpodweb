# Build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npx tsc -p server/tsconfig.json

# Serve stage
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
EXPOSE 80
CMD ["node", "--experimental-detect-module", "server/test-server.js"]
