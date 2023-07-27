FROM node:16-alpine

ENV NODE_ENV production

WORKDIR /opt/orbs

COPY package*.json ./
COPY .version ./version

# Add daemontools as a requirement from the ethereum-writer Dockerfile
RUN apk add --no-cache git daemontools --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing

RUN apk --no-cache --virtual build-dependencies add \
    python3 \
    make \
    g++ \
    && npm install \
    && apk del build-dependencies

COPY ./healthcheck/healthcheck ./
COPY ./healthcheck/healthcheck.js ./
COPY ./healthcheck/entrypoint.sh /opt/orbs/service

HEALTHCHECK CMD /opt/orbs/healthcheck

COPY dist ./dist

CMD [ "npm", "start" ]