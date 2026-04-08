#!/bin/bash
#
# MentorMind Local Docker Setup
# Validates prerequisites, builds all images, and starts services with health checks.
#
# Usage:
#   ./scripts/local-setup.sh          # Full build + start
#   ./scripts/local-setup.sh --check  # Prerequisites check only
#   ./scripts/local-setup.sh --down   # Stop all services
#   ./scripts/local-setup.sh --logs   # Tail all service logs
#

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; }
header(){ echo -e "\n${BLUE}── $* ──${NC}"; }

ERRORS=0

# ── 1. Prerequisites ────────────────────────────────────────────────────────
check_prerequisites() {
    header "Checking Prerequisites"

    # Docker
    if command -v docker &>/dev/null; then
        local dv
        dv=$(docker --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
        ok "Docker installed (v$dv)"
    else
        fail "Docker not installed — https://docs.docker.com/get-docker/"
        ERRORS=$((ERRORS + 1))
    fi

    # Docker daemon
    if docker info &>/dev/null; then
        ok "Docker daemon running"
    else
        fail "Docker daemon not running — start Docker Desktop or 'sudo systemctl start docker'"
        ERRORS=$((ERRORS + 1))
    fi

    # docker compose (v2 plugin or standalone)
    if docker compose version &>/dev/null; then
        local cv
        cv=$(docker compose version --short 2>/dev/null || echo "unknown")
        ok "docker compose available (v$cv)"
    elif command -v docker-compose &>/dev/null; then
        warn "Using legacy docker-compose — consider upgrading to Docker Compose v2"
    else
        fail "docker compose not available"
        ERRORS=$((ERRORS + 1))
    fi

    # Disk space (need ~5 GB for images)
    local avail_kb
    avail_kb=$(df -k "$PROJECT_DIR" | tail -1 | awk '{print $4}')
    local avail_gb=$(( avail_kb / 1048576 ))
    if [ "$avail_gb" -ge 5 ]; then
        ok "Disk space: ${avail_gb} GB available"
    else
        warn "Low disk space: ${avail_gb} GB available (recommend >= 5 GB)"
    fi

    # Port conflicts
    local ports=("5432" "6379" "8000" "3000")
    local port_names=("PostgreSQL" "Redis" "Backend" "Frontend")
    for i in "${!ports[@]}"; do
        if lsof -i :"${ports[$i]}" &>/dev/null; then
            warn "Port ${ports[$i]} (${port_names[$i]}) already in use — will conflict with Docker"
        else
            ok "Port ${ports[$i]} (${port_names[$i]}) available"
        fi
    done
}

# ── 2. Environment ──────────────────────────────────────────────────────────
check_env() {
    header "Checking Environment Configuration"

    local env_file="$PROJECT_DIR/.env"
    local env_example="$PROJECT_DIR/.env.example"

    if [ ! -f "$env_file" ]; then
        if [ -f "$env_example" ]; then
            warn ".env not found — copying from .env.example"
            cp "$env_example" "$env_file"
            warn "Edit .env and fill in your API keys before starting"
            ERRORS=$((ERRORS + 1))
        else
            fail "Neither .env nor .env.example found"
            ERRORS=$((ERRORS + 1))
            return
        fi
    else
        ok ".env file exists"
    fi

    # Check critical env vars
    local required_vars=("DEEPSEEK_API_KEY")
    local optional_vars=("SILICONFLOW_API_KEY" "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" "CLERK_SECRET_KEY")

    for var in "${required_vars[@]}"; do
        local val
        val=$(grep -E "^${var}=" "$env_file" 2>/dev/null | cut -d= -f2- | tr -d ' "'"'" || true)
        if [ -z "$val" ] || [ "$val" = "your_deepseek_api_key_here" ]; then
            fail "$var not set in .env (required)"
            ERRORS=$((ERRORS + 1))
        else
            ok "$var configured"
        fi
    done

    for var in "${optional_vars[@]}"; do
        local val
        val=$(grep -E "^${var}=" "$env_file" 2>/dev/null | cut -d= -f2- | tr -d ' "'"'" || true)
        if [ -z "$val" ]; then
            warn "$var not set (optional — some features may be disabled)"
        else
            ok "$var configured"
        fi
    done
}

# ── 3. Validate Docker files ────────────────────────────────────────────────
check_docker_files() {
    header "Validating Docker Configuration"

    if [ -f "$COMPOSE_FILE" ]; then
        ok "docker-compose.yml found"
    else
        fail "docker-compose.yml not found at $COMPOSE_FILE"
        ERRORS=$((ERRORS + 1))
        return
    fi

    if [ -f "$PROJECT_DIR/backend/Dockerfile" ]; then
        ok "backend/Dockerfile found"
    else
        fail "backend/Dockerfile missing"
        ERRORS=$((ERRORS + 1))
    fi

    if [ -f "$PROJECT_DIR/web/Dockerfile" ]; then
        ok "web/Dockerfile found"
    else
        fail "web/Dockerfile missing"
        ERRORS=$((ERRORS + 1))
    fi

    # Check .dockerignore
    if [ -f "$PROJECT_DIR/backend/.dockerignore" ]; then
        ok "backend/.dockerignore present"
    else
        warn "backend/.dockerignore missing — .env may leak into build context"
    fi

    if [ -f "$PROJECT_DIR/web/.dockerignore" ]; then
        ok "web/.dockerignore present"
    else
        warn "web/.dockerignore missing — node_modules may bloat build"
    fi

    # Validate compose syntax
    if docker compose -f "$COMPOSE_FILE" config --quiet 2>/dev/null; then
        ok "docker-compose.yml syntax valid"
    else
        fail "docker-compose.yml has syntax errors"
        ERRORS=$((ERRORS + 1))
    fi
}

# ── 4. Build ─────────────────────────────────────────────────────────────────
build_images() {
    header "Building Docker Images"

    info "Building backend image (this may take several minutes on first run)..."
    if docker compose -f "$COMPOSE_FILE" build backend 2>&1 | tail -5; then
        ok "Backend image built"
    else
        fail "Backend image build failed"
        ERRORS=$((ERRORS + 1))
        return
    fi

    info "Building frontend image..."
    if docker compose -f "$COMPOSE_FILE" build frontend 2>&1 | tail -5; then
        ok "Frontend image built"
    else
        fail "Frontend image build failed"
        ERRORS=$((ERRORS + 1))
        return
    fi

    ok "All images built successfully"
}

# ── 5. Start & Health Check ──────────────────────────────────────────────────
start_services() {
    header "Starting Services"

    info "Starting infrastructure (postgres, redis)..."
    docker compose -f "$COMPOSE_FILE" up -d postgres redis

    info "Waiting for infrastructure health checks..."
    local retries=30
    while [ $retries -gt 0 ]; do
        local pg_healthy redis_healthy
        pg_healthy=$(docker inspect --format='{{.State.Health.Status}}' mentormind-postgres 2>/dev/null || echo "missing")
        redis_healthy=$(docker inspect --format='{{.State.Health.Status}}' mentormind-redis 2>/dev/null || echo "missing")

        if [ "$pg_healthy" = "healthy" ] && [ "$redis_healthy" = "healthy" ]; then
            ok "PostgreSQL: healthy"
            ok "Redis: healthy"
            break
        fi

        retries=$((retries - 1))
        if [ $retries -eq 0 ]; then
            fail "Infrastructure services did not become healthy"
            fail "PostgreSQL: $pg_healthy | Redis: $redis_healthy"
            docker compose -f "$COMPOSE_FILE" logs postgres redis | tail -20
            ERRORS=$((ERRORS + 1))
            return
        fi
        sleep 2
    done

    info "Starting backend + celery workers..."
    docker compose -f "$COMPOSE_FILE" up -d backend celery-orchestration celery-rendering celery-heavy-ml

    info "Waiting for backend health check (may take 30s for model loading)..."
    retries=45
    while [ $retries -gt 0 ]; do
        local be_healthy
        be_healthy=$(docker inspect --format='{{.State.Health.Status}}' mentormind-backend 2>/dev/null || echo "missing")

        if [ "$be_healthy" = "healthy" ]; then
            ok "Backend: healthy"
            break
        fi

        retries=$((retries - 1))
        if [ $retries -eq 0 ]; then
            warn "Backend did not pass healthcheck within timeout — may still be loading models"
            warn "Check logs: docker compose logs backend"
        fi
        sleep 2
    done

    info "Starting frontend..."
    docker compose -f "$COMPOSE_FILE" up -d frontend

    # Final verification
    sleep 5
    header "Service Status"
    docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
}

# ── 6. Stop ──────────────────────────────────────────────────────────────────
stop_services() {
    header "Stopping All Services"
    docker compose -f "$COMPOSE_FILE" down
    ok "All services stopped"
}

# ── 7. Logs ──────────────────────────────────────────────────────────────────
show_logs() {
    docker compose -f "$COMPOSE_FILE" logs -f --tail=50
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
    echo -e "${BLUE}"
    echo "  __  __            _            __  __ _           _ "
    echo " |  \/  | ___ _ __ | |_ ___  _ _|  \/  (_)_ __   __| |"
    echo " | |\/| |/ _ \ '_ \| __/ _ \| '__| |\/| | | '_ \ / _\` |"
    echo " | |  | |  __/ | | | || (_) | |  | |  | | | | | | (_| |"
    echo " |_|  |_|\___|_| |_|\__\___/|_|  |_|  |_|_|_| |_|\__,_|"
    echo -e "${NC}"
    echo "  Local Docker Setup"
    echo ""

    local mode="${1:-full}"

    case "$mode" in
        --check)
            check_prerequisites
            check_env
            check_docker_files
            ;;
        --down)
            stop_services
            return 0
            ;;
        --logs)
            show_logs
            return 0
            ;;
        *)
            check_prerequisites
            check_env
            check_docker_files

            if [ "$ERRORS" -gt 0 ]; then
                echo ""
                fail "$ERRORS error(s) found. Fix them before building."
                fail "Run './scripts/local-setup.sh --check' to re-verify."
                exit 1
            fi

            build_images
            if [ "$ERRORS" -gt 0 ]; then
                fail "Build failed. Check errors above."
                exit 1
            fi

            start_services
            ;;
    esac

    echo ""
    if [ "$ERRORS" -eq 0 ]; then
        ok "All checks passed!"
        echo ""
        echo -e "  ${GREEN}Frontend:${NC}  http://localhost:3000"
        echo -e "  ${GREEN}Backend:${NC}   http://localhost:8000"
        echo -e "  ${GREEN}Health:${NC}    http://localhost:8000/health"
        echo -e "  ${GREEN}Postgres:${NC}  localhost:5432"
        echo -e "  ${GREEN}Redis:${NC}     localhost:6379"
        echo ""
        echo "  Useful commands:"
        echo "    ./scripts/local-setup.sh --logs   # Tail all logs"
        echo "    ./scripts/local-setup.sh --down   # Stop everything"
        echo "    docker compose ps                 # Service status"
    else
        fail "$ERRORS issue(s) found. Review the output above."
        exit 1
    fi
}

main "$@"
