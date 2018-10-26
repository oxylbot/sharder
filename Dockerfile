FROM node:10.12.0-alpine

ARG NODE_ENV

ENV NODE_ENV=${NODE_ENV}

COPY . /app

WORKDIR /app

RUN apt-get update && apt-get install -y build-essential

RUN npm install --production

CMD ["npm", "start"]