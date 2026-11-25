FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push --skip-generate && npm run start"]