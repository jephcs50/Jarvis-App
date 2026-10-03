FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# No runtime dependencies: the server uses only Node built-ins and runs TypeScript natively.
COPY package.json ./
COPY src ./src
USER node
EXPOSE 8787
CMD ["node", "src/index.ts"]
