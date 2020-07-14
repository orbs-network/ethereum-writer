#!/bin/bash -e

if [[ $CIRCLE_TAG == v* ]] ;
then
  VERSION=$CIRCLE_TAG
else
  VERSION=experimental
fi

docker login -u $DOCKER_HUB_LOGIN -p $DOCKER_HUB_PASSWORD

docker tag orbsnetwork/ethereum-writer:$(cat .version) orbsnetwork/ethereum-writer:$VERSION
docker push orbsnetwork/ethereum-writer:$VERSION