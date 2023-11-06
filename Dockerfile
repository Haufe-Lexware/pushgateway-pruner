FROM node:18-alpine

RUN mkdir -p /usr/src/app && \
    chown -R node:node /usr/src/app
WORKDIR /usr/src/app
USER node
COPY --chown=node:node package.json /usr/src/app
COPY --chown=node:node package-lock.json /usr/src/app
RUN npm install

COPY . /usr/src/app

CMD ["node", "index.js"]
