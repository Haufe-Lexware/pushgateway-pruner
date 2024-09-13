FROM node:18-alpine

RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app

COPY package.json /usr/src/app
COPY package-lock.json /usr/src/app

# Change ownership of files before running npm install
RUN chown -R node:node /usr/src/app

USER node

RUN npm install

COPY . /usr/src/app

CMD ["node", "src/index.js"]
