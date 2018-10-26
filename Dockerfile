FROM eugenmayer/make
FROM gcc
FROM python:2.7-slim

FROM node:10.12.0-jessie

ARG NODE_ENV

ENV NODE_ENV=${NODE_ENV}

COPY . /home/app

WORKDIR /home/app

RUN apt-get update && apt-get install -y build-essential

RUN npm install --production

CMD ["npm", "start"]