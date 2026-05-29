#!/usr/bin/env bash
#
# MentorMind production deploy helper for a single CentOS/VPS Docker host.
# It builds only the images that own build contexts; Celery workers reuse the
# backend image so dependency layers and model caches survive routine deploys.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${MENTORMIND_COMPOSE_FILE:-$PROJECT_DIR/docker-compose.prod.yml}"
ENV_FILE="${MENTORMIND_ENV_FILE:-$PROJECT_DIR/.env}"

export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"
export COMPOSE_DOCKER_CLI_BUILD="${COMPOSE_DOCKER_CLI_BUILD:-1}"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-prod.sh [command]

Commands:
  check     Validate shell, env file, and rendered compose config
  config    Validate compose and print services/images without env values
  smoke     Test the public /ws/ WebSocket upgrade path
  deploy    Build changed app images and start/update all production services
  build     Build backend, frontend, and nginx images only
  up        Start/update services without rebuilding
  restart   Restart app services without rebuilding images
  ps        Show service status
  logs      Tail production logs
  down      Stop production services

Default command: deploy

Environment overrides:
  MENTORMIND_ENV_FILE=/path/to/.env
  MENTORMIND_COMPOSE_FILE=/path/to/docker-compose.prod.yml
  PUBLIC_APP_URL=https://your-domain.com
EOF
}

require_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "Missing $ENV_FILE. Copy .env.example to .env and fill production values first." >&2
    exit 1
  fi
}

require_docker_cli() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed." >&2
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose v2 is required. Install the docker compose plugin." >&2
    exit 1
  fi
}

require_daemon() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not reachable. Start Docker before build/deploy/up/restart/logs/ps/down." >&2
    exit 1
  fi
}

require_prereqs() {
  require_env_file
  require_docker_cli
  require_daemon
}

check_config() {
  require_env_file
  require_docker_cli
  bash -n "$0"
  compose config --quiet
  compose config --services
}

show_config_summary() {
  require_env_file
  require_docker_cli
  compose config --quiet
  echo "Services:"
  compose config --services
  echo ""
  echo "Images:"
  compose config --images
}

smoke_test() {
  local public_url="${PUBLIC_APP_URL:-}"
  if [ -z "$public_url" ] && [ -f "$ENV_FILE" ]; then
    public_url="$(grep -E '^NEXT_PUBLIC_APP_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  fi
  public_url="${public_url:-https://mentormind.cloud}"
  python3 "$PROJECT_DIR/scripts/ws-smoke-test.py" "$public_url"
}

build_images() {
  compose build backend frontend nginx
}

deploy() {
  build_images
  compose up -d --remove-orphans
  compose ps
}

case "${1:-deploy}" in
  check)
    check_config
    ;;
  config)
    show_config_summary
    ;;
  smoke)
    smoke_test
    ;;
  deploy)
    require_prereqs
    deploy
    ;;
  build)
    require_prereqs
    build_images
    ;;
  up)
    require_prereqs
    compose up -d --remove-orphans
    ;;
  restart)
    require_prereqs
    compose restart backend celery-orchestration celery-rendering celery-heavy-ml frontend nginx
    ;;
  ps)
    require_prereqs
    compose ps
    ;;
  logs)
    require_prereqs
    compose logs -f --tail=100
    ;;
  down)
    require_prereqs
    compose down
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
