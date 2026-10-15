FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm config set registry http://mirrors.cloud.tencent.com/npm/
RUN npm install --production

COPY src/ src/

ENV PORT=32124
EXPOSE ${PORT}

CMD ["node", "src/index.js"]
