FROM node:16-alpine

ENV NODE_ENV production

WORKDIR /opt/orbs

COPY package*.json ./

# git is needed only to fetch one git dependency (ethereumjs-abi); python3/make/g++ only to build
# native modules. They are removed in the same layer. npm ci installs exactly the lockfile, without
# devDependencies, so the image runs the dependency tree that was tested.
# see https://github.com/nodejs/docker-node/issues/282
RUN apk --no-cache --virtual build-dependencies add \
    git \
    python3 \
    make \
    g++ \
    && npm ci --omit=dev \
    && npm cache clean --force \
    && apk del build-dependencies

# written by scripts/create-version-file.sh (npm run build), published as Payload.Version
COPY .version ./version
COPY .commit ./commit

# docker-compose runs `node healthcheck.js` from /opt/orbs
COPY healthcheck.js ./healthcheck.js
HEALTHCHECK CMD node healthcheck.js || exit 1

COPY dist ./dist

CMD [ "npm", "start" ]
