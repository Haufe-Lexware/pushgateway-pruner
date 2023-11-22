FROM node:18-alpine

RUN mkdir -p /usr/src/app && \
    chown -R node:node /usr/src/app

USER node

WORKDIR /usr/src/app

COPY --chown=node:node package.json /usr/src/app
COPY --chown=node:node package-lock.json /usr/src/app
COPY . /usr/src/app

RUN npm install

CMD ["node", "src/index.js"]
