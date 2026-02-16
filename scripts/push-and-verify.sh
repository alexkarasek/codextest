#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/push-and-verify.sh --user <dockerhub_user> --image <repo_name> [options]

Options:
  --tag <tag>                Image tag to push/test (default: latest)
  --local-image <name:tag>   Local source image tag (default: auto-detect)
  --version-tag <tag>        Optional extra version tag to also push
  --api-key <key>            API key for runtime verification (fallback: OPENAI_API_KEY env)
  --port <port>              Host port for verification container (default: 3800)
  --skip-push                Skip push (only pull/run verification)
  --skip-run                 Skip pull/run verification
  -h, --help                 Show this help

Examples:
  scripts/push-and-verify.sh --user alexk002 --image persona-debate-app --api-key "$OPENAI_API_KEY"
  scripts/push-and-verify.sh --user alexk002 --image persona-debate-app --tag latest --version-tag v2026-02-16 --api-key "$OPENAI_API_KEY"
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

image_exists() {
  docker image inspect "$1" >/dev/null 2>&1
}

wait_for_health() {
  local url="$1"
  local tries=30
  local i
  for i in $(seq 1 "$tries"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

USER_NAME=""
IMAGE_NAME=""
TAG="latest"
LOCAL_IMAGE=""
VERSION_TAG=""
API_KEY="${OPENAI_API_KEY:-}"
PORT="3800"
SKIP_PUSH="0"
SKIP_RUN="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      USER_NAME="${2:-}"; shift 2 ;;
    --image)
      IMAGE_NAME="${2:-}"; shift 2 ;;
    --tag)
      TAG="${2:-}"; shift 2 ;;
    --local-image)
      LOCAL_IMAGE="${2:-}"; shift 2 ;;
    --version-tag)
      VERSION_TAG="${2:-}"; shift 2 ;;
    --api-key)
      API_KEY="${2:-}"; shift 2 ;;
    --port)
      PORT="${2:-}"; shift 2 ;;
    --skip-push)
      SKIP_PUSH="1"; shift ;;
    --skip-run)
      SKIP_RUN="1"; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1 ;;
  esac
done

if [[ -z "$USER_NAME" || -z "$IMAGE_NAME" ]]; then
  echo "--user and --image are required." >&2
  usage
  exit 1
fi

require_cmd docker
require_cmd curl

TARGET_IMAGE="${USER_NAME}/${IMAGE_NAME}:${TAG}"

if [[ -z "$LOCAL_IMAGE" ]]; then
  if image_exists "$TARGET_IMAGE"; then
    LOCAL_IMAGE="$TARGET_IMAGE"
  elif image_exists "codextest_app:latest"; then
    LOCAL_IMAGE="codextest_app:latest"
  else
    echo "Could not auto-detect local source image. Use --local-image <name:tag>." >&2
    exit 1
  fi
fi

if ! image_exists "$LOCAL_IMAGE"; then
  echo "Local image not found: $LOCAL_IMAGE" >&2
  exit 1
fi

echo "Local source image: $LOCAL_IMAGE"
echo "Target image:       $TARGET_IMAGE"

if [[ "$LOCAL_IMAGE" != "$TARGET_IMAGE" ]]; then
  echo "Tagging local image -> target..."
  docker tag "$LOCAL_IMAGE" "$TARGET_IMAGE"
fi

if [[ "$SKIP_PUSH" == "0" ]]; then
  echo "Logging into Docker Hub (interactive)..."
  docker login

  echo "Pushing $TARGET_IMAGE ..."
  docker push "$TARGET_IMAGE"

  if [[ -n "$VERSION_TAG" ]]; then
    VERSION_IMAGE="${USER_NAME}/${IMAGE_NAME}:${VERSION_TAG}"
    echo "Tagging/pushing additional version: $VERSION_IMAGE"
    docker tag "$TARGET_IMAGE" "$VERSION_IMAGE"
    docker push "$VERSION_IMAGE"
  fi
fi

if [[ "$SKIP_RUN" == "1" ]]; then
  echo "Skipped runtime verification (--skip-run)."
  exit 0
fi

if [[ -z "$API_KEY" ]]; then
  echo "API key required for verification. Provide --api-key or OPENAI_API_KEY env." >&2
  exit 1
fi

VERIFY_CONTAINER="${IMAGE_NAME//[^a-zA-Z0-9_.-]/-}-verify"
HEALTH_URL="http://127.0.0.1:${PORT}/health"

cleanup() {
  docker stop "$VERIFY_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Pulling image for verification..."
docker pull "$TARGET_IMAGE"

echo "Starting verification container: $VERIFY_CONTAINER"
docker run --rm -d \
  --name "$VERIFY_CONTAINER" \
  -p "${PORT}:3000" \
  -e "OPENAI_API_KEY=${API_KEY}" \
  "$TARGET_IMAGE" >/dev/null

echo "Waiting for health endpoint: $HEALTH_URL"
if wait_for_health "$HEALTH_URL"; then
  echo "Health check OK."
  echo "Response:"
  curl -fsS "$HEALTH_URL"
  echo
  echo "Success: push + pull + run verification completed."
else
  echo "Health check failed. Container logs:" >&2
  docker logs "$VERIFY_CONTAINER" >&2 || true
  exit 1
fi
