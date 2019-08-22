from node:alpine

RUN apk add --no-cache --virtual .build-deps \
    ca-certificates \
    wget \
    tar && \
    cd /usr/local/bin && \
    wget https://yarnpkg.com/latest.tar.gz && \
    tar zvxf latest.tar.gz && \
    ln -s /usr/local/bin/dist/bin/yarn.js /usr/local/bin/yarn.js && \
    apk del .build-deps


# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN yarn install

COPY packages/rafiki-benchmark packages/rafiki-benchmark
COPY packages/rafiki-core packages/rafiki-core
COPY packages/rafiki-utils packages/rafiki-utils
COPY packages/rafiki-middleware packages/rafiki-middleware
COPY packages/rafiki-logger-pino packages/rafiki-logger-pino

COPY lerna.json .
COPY tsconfig.json .
COPY tslint.json .
RUN yarn bootstrap

RUN yarn build

CMD ["yarn", "--cwd", "packages/rafiki-benchmark", "start"]