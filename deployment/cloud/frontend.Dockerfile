FROM node:18-slim

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
RUN npm install -g pnpm && pnpm install

COPY . .
RUN pnpm run build

RUN npm install -g serve
CMD ["serve", "-s", "dist", "-l", "3000"]
