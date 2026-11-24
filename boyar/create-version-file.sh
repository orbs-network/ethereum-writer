#!/bin/bash -e
# Writes .version (published as Payload.Version.Semantic) and .commit (Payload.Version.Commit).
# Same rules as evm-reader's scripts/create-version-file.sh.
#
# Version source, in order:
#   1. $VERSION            e.g. VERSION=v1.9.0 npm run build   (must match the image tag)
#   2. $CIRCLE_TAG         CI release runs
#   3. a vX.Y.Z tag pointing exactly at HEAD
#   4. otherwise "<latest tag>-dev-<short commit>" (clearly not a release)
# A build from a working tree with uncommitted changes is marked "-dirty".

COMMIT=$(git rev-parse HEAD)
SHORT_COMMIT=$(echo "$COMMIT" | cut -c1-8)
DIRTY=""
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    DIRTY="-dirty"
fi

TAG="${VERSION:-$CIRCLE_TAG}"
if [[ -z "$TAG" ]]; then
    TAG=$(git tag --points-at HEAD --list 'v*' --sort=-v:refname | head -n 1)
fi

if [[ -n "$TAG" ]]; then
    if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
        echo "Version '$TAG' is invalid, must use format vX.Y.Z" >&2
        exit 2
    fi
    echo "$TAG$DIRTY" > .version
else
    LATEST_SEMVER=$(git tag --sort=-v:refname --list 'v*' | head -n 1)
    echo "${LATEST_SEMVER:-v0.0.0}-dev-$SHORT_COMMIT$DIRTY" > .version
fi

echo "$COMMIT$DIRTY" > .commit
echo "version: $(cat .version)  commit: $(cat .commit)"
