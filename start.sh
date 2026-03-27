#!/bin/bash

# Exit on error
set -e

COMMAND=$1
INSTANCE_ID=$2

case "$COMMAND" in
  build)
    echo "Building containers"
    docker compose build
    docker compose --file docker-compose-instance.yml build
    ;;

  create)
    echo "Creating volumes and network"
    docker volume create crackosaurus-instances
    docker volume create crackosaurus-wordlists
    docker network create crackosaurus-app
    ;;

  delete)
    echo "Deleting volumes and network"
    docker volume rm crackosaurus-instances
    docker volume rm crackosaurus-wordlists
    docker network rm crackosaurus-app
    docker compose down --volumes
    ;;

  up)
    echo "Starting all services"
    docker compose up -d
    ;;

  down)
    echo "Stopping all services"
    docker compose down
    docker compose --file docker-compose-instance.yml down
    ;;

  instance)
    if [ -z "$INSTANCE_ID" ]; then
      echo "You need to specify the INSTANCE_ID"
      exit 1
    else
      INSTANCE_ID=$INSTANCE_ID docker compose --file docker-compose-instance.yml up -d
    fi
    ;;
  *)
    echo "Invalid command"
    echo "Usage:"
    echo "  ./start.sh build"
    echo "  ./start.sh create"
    echo "  ./start.sh delete"
    echo "  ./start.sh up"
    echo "  ./start.sh down"
    echo "  ./start.sh instance [INSTANCE_ID]"
    exit 1
    ;;
esac