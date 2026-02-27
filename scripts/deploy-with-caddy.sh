#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DOMAIN=""
EMAIL=""
ENV_FILE="${PROJECT_DIR}/.env.deploy"
CADDYFILE_PATH="/etc/caddy/Caddyfile"
BULL_BOARD_USER=""
BULL_BOARD_PASSWORD=""
SKIP_BUILD=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/deploy-with-caddy.sh --domain your-domain.com [options]

Options:
  -d, --domain           Required. Domain used for public access.
  -e, --email            Optional. Email for ACME notifications.
      --env-file         Optional. Compose env file path (default: .env.deploy).
      --bull-user        Optional. Bull Board basic auth username.
      --bull-password    Optional. Bull Board basic auth password.
      --skip-build       Optional. Start existing images without rebuilding.
  -h, --help             Show this help.

Notes:
  1) Point the domain DNS A/AAAA record to this server before running.
  2) Ensure ports 80 and 443 are reachable from the internet.
  3) On Debian/Ubuntu, Caddy will be auto-installed if missing.
EOF
}

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy][error] %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  command -v "${cmd}" >/dev/null 2>&1 || fail "Missing command: ${cmd}"
}

normalize_domain() {
  local value="$1"
  value="${value#http://}"
  value="${value#https://}"
  value="${value%%/*}"
  printf '%s' "${value}"
}

generate_hex_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi
  LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 64
}

upsert_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp
  tmp="$(mktemp)"

  awk -v k="${key}" -v v="${value}" '
    BEGIN { updated = 0 }
    $0 ~ ("^" k "=") {
      if (updated == 0) {
        print k "=" v
        updated = 1
      }
      next
    }
    { print }
    END {
      if (updated == 0) {
        print k "=" v
      }
    }
  ' "${file}" > "${tmp}"

  mv "${tmp}" "${file}"
}

set_if_missing_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  if ! grep -q "^${key}=" "${file}" 2>/dev/null; then
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

install_caddy_if_needed() {
  local sudo_cmd="$1"
  if command -v caddy >/dev/null 2>&1; then
    return
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    fail "Caddy is not installed, and auto-install currently supports Debian/Ubuntu only."
  fi

  log "Caddy not found. Installing via apt."
  ${sudo_cmd} apt-get update -y
  ${sudo_cmd} apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  ${sudo_cmd} install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/caddy-stable-archive-keyring.gpg ]]; then
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | ${sudo_cmd} gpg --dearmor -o /etc/apt/keyrings/caddy-stable-archive-keyring.gpg
  fi
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | ${sudo_cmd} tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  ${sudo_cmd} apt-get update -y
  ${sudo_cmd} apt-get install -y caddy
}

write_caddyfile() {
  local domain="$1"
  local email="$2"
  local target="$3"

  if [[ -n "${email}" ]]; then
    cat > "${target}" <<EOF
{
    email ${email}
}

${domain} {
    encode zstd gzip

    @queues path /admin/queues*
    handle @queues {
        reverse_proxy 127.0.0.1:13010
    }

    handle {
        reverse_proxy 127.0.0.1:13000
    }
}
EOF
    return
  fi

  cat > "${target}" <<EOF
${domain} {
    encode zstd gzip

    @queues path /admin/queues*
    handle @queues {
        reverse_proxy 127.0.0.1:13010
    }

    handle {
        reverse_proxy 127.0.0.1:13000
    }
}
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--domain)
      [[ $# -ge 2 ]] || fail "Missing value for $1"
      DOMAIN="$2"
      shift 2
      ;;
    -e|--email)
      [[ $# -ge 2 ]] || fail "Missing value for $1"
      EMAIL="$2"
      shift 2
      ;;
    --env-file)
      [[ $# -ge 2 ]] || fail "Missing value for $1"
      ENV_FILE="$2"
      shift 2
      ;;
    --bull-user)
      [[ $# -ge 2 ]] || fail "Missing value for $1"
      BULL_BOARD_USER="$2"
      shift 2
      ;;
    --bull-password)
      [[ $# -ge 2 ]] || fail "Missing value for $1"
      BULL_BOARD_PASSWORD="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

if [[ -z "${DOMAIN}" ]]; then
  read -r -p "Domain (example.com): " DOMAIN
fi

DOMAIN="$(normalize_domain "${DOMAIN}")"
[[ -n "${DOMAIN}" ]] || fail "Domain cannot be empty."

require_cmd docker
docker compose version >/dev/null 2>&1 || fail "docker compose plugin is required."

SUDO_CMD=""
if [[ "${EUID}" -ne 0 ]]; then
  require_cmd sudo
  SUDO_CMD="sudo"
fi

install_caddy_if_needed "${SUDO_CMD}"

mkdir -p "$(dirname "${ENV_FILE}")"
touch "${ENV_FILE}"

log "Preparing env file: ${ENV_FILE}"
upsert_env "NEXTAUTH_URL" "https://${DOMAIN}" "${ENV_FILE}"
upsert_env "APP_BIND_IP" "127.0.0.1" "${ENV_FILE}"
upsert_env "MYSQL_BIND_IP" "127.0.0.1" "${ENV_FILE}"
upsert_env "REDIS_BIND_IP" "127.0.0.1" "${ENV_FILE}"
upsert_env "INTERNAL_TASK_API_BASE_URL" "http://127.0.0.1:3000" "${ENV_FILE}"

set_if_missing_env "NEXTAUTH_SECRET" "$(generate_hex_secret)" "${ENV_FILE}"
set_if_missing_env "CRON_SECRET" "$(generate_hex_secret)" "${ENV_FILE}"
set_if_missing_env "INTERNAL_TASK_TOKEN" "$(generate_hex_secret)" "${ENV_FILE}"
set_if_missing_env "API_ENCRYPTION_KEY" "$(generate_hex_secret)" "${ENV_FILE}"

if [[ -z "${BULL_BOARD_USER}" ]]; then
  BULL_BOARD_USER="admin"
fi
if [[ -z "${BULL_BOARD_PASSWORD}" ]]; then
  BULL_BOARD_PASSWORD="$(generate_hex_secret)"
fi
upsert_env "BULL_BOARD_USER" "${BULL_BOARD_USER}" "${ENV_FILE}"
upsert_env "BULL_BOARD_PASSWORD" "${BULL_BOARD_PASSWORD}" "${ENV_FILE}"

log "Starting application stack"
cd "${PROJECT_DIR}"
if [[ "${SKIP_BUILD}" -eq 1 ]]; then
  docker compose --env-file "${ENV_FILE}" up -d
else
  docker compose --env-file "${ENV_FILE}" up -d --build
fi

tmp_caddyfile="$(mktemp)"
write_caddyfile "${DOMAIN}" "${EMAIL}" "${tmp_caddyfile}"

if [[ -f "${CADDYFILE_PATH}" ]]; then
  backup_path="${CADDYFILE_PATH}.bak.$(date +%Y%m%d%H%M%S)"
  log "Backing up existing Caddyfile to ${backup_path}"
  ${SUDO_CMD} cp "${CADDYFILE_PATH}" "${backup_path}"
fi

log "Applying Caddy reverse proxy config for ${DOMAIN}"
${SUDO_CMD} mkdir -p "$(dirname "${CADDYFILE_PATH}")"
${SUDO_CMD} cp "${tmp_caddyfile}" "${CADDYFILE_PATH}"
rm -f "${tmp_caddyfile}"

${SUDO_CMD} caddy validate --config "${CADDYFILE_PATH}"

if command -v systemctl >/dev/null 2>&1; then
  ${SUDO_CMD} systemctl enable --now caddy
  ${SUDO_CMD} systemctl reload caddy
  log "Caddy service reloaded."
else
  log "systemctl not found. Start Caddy manually with: caddy run --config ${CADDYFILE_PATH}"
fi

log "Deployment finished."
printf '\n'
printf 'App URL: https://%s\n' "${DOMAIN}"
printf 'Bull Board: https://%s/admin/queues\n' "${DOMAIN}"
printf 'Bull Board credentials: %s / %s\n' "${BULL_BOARD_USER}" "${BULL_BOARD_PASSWORD}"
printf 'Env file: %s\n' "${ENV_FILE}"
