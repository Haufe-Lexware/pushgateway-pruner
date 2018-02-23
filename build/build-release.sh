#!/bin/bash

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <release tag> [image name]"
    echo "Env vars which change behaviour:"
    echo "  - REGISTRY_USERNAME: Specify to log in to a registry and push the image"
    echo "  - REGISTRY_PASSWORD: Needed if username is set"
    echo "  - REGISTRY: Specify docker registry, or leave empty for Docker Hub"
    exit 1
fi

imageName="haufelexware/pushgateway-pruner"
if [ ! -z "$2" ]; then
    imageName="$2"
fi
echo "======================================================================="
echo "Using image name ${imageName}"

releaseTag="$1"
if [ -d ./release/${releaseTag} ]; then
    echo "Cleaning up release directory..."
    rm -rf ./release/${releaseTag}
fi
echo "Downloading source for release tag $1..."
echo "======================================================================="

mkdir -p ./release/${releaseTag}
curl -L -o ./release/${releaseTag}/release.tgz https://github.com/Haufe-Lexware/pushgateway-pruner/archive/v${releaseTag}.tar.gz

echo "======================================================================="
echo "Unpacking source and building docker image"
echo "======================================================================="

fullImageName="${imageName}:${releaseTag}"
pushd release/${releaseTag}
    tar xvzf release.tgz
    pushd pushgateway-pruner-${releaseTag}
    docker build -t ${fullImageName} .
popd

echo "======================================================================="
echo "Image has been built as ${fullImageName}"
echo "======================================================================="

if [ ! -z "$REGISTRY_USERNAME" ]; then
    if [ -z "$REGISTRY_PASSWORD" ]; then
        echo "ERROR: REGISTRY_USERNAME is set, but REGISTRY_PASSWORD is empty."
        exit 1
    fi

    echo "Pushing image to registry..."
    registry=""
    if [ ! -z "$REGISTRY" ]; then
        echo "Using custom registry ${REGISTRY}"
        registry="${REGISTRY}"
    fi
    echo "======================================================================="

    docker login --username ${REGISTRY_USERNAME} --password ${REGISTRY_PASSWORD} ${registry}
    docker push ${fullImageName}

    echo "======================================================================="
fi

echo "Successfully finished"
echo "======================================================================="
