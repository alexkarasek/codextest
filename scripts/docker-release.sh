#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
One-command Docker release: bump version, build image, push to Docker Hub.

Usage:
  scripts/docker-release.sh [options]

Options:
  --user <dockerhub_user>      Docker Hub user/org (default: $DOCKERHUB_USER)
  --image <repo_name>          Docker Hub repo/image name (default: $DOCKERHUB_IMAGE or persona-debate-app)
  --bump <patch|minor|major>   Semver increment type (default: patch)
  --version <x.y.z>            Explicit version (skips automatic bump)
  --version-file <path>        Track file for release version (default: .docker-release-version)
  --no-latest                  Do not tag/push :latest
  --no-push                    Build/tag only, skip push
  -h, --help                   Show help

Examples:
  DOCKERHUB_USER=alexk002 npm run docker:release
  npm run docker:release -- --user alexk002 --image persona-debate-app --bump minor
  npm run docker:release -- --user alexk002 --version 1.4.0
  npm run docker:release -- --no-push
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

is_semver() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

bump_semver() {
  local version="$1"
  local bump="$2"
  local major minor patch
  IFS='.' read -r major minor patch <<<"$version"

  case "$bump" in
    patch)
      patch=$((patch + 1))
      ;;
    minor)
      minor=$((minor + 1))
      patch=0
      ;;
    major)
      major=$((major + 1))
      minor=0
      patch=0
      ;;
    *)
      echo "Invalid bump type: $bump" >&2
      exit 1
      ;;
  esac

  echo "${major}.${minor}.${patch}"
}

DOCKER_USER="${DOCKERHUB_USER:-}"
DOCKER_IMAGE="${DOCKERHUB_IMAGE:-persona-debate-app}"
BUMP_KIND="patch"
EXPLICIT_VERSION=""
VERSION_FILE=".docker-release-version"
PUSH_IMAGE="1"
TAG_LATEST="1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      DOCKER_USER="${2:-}"; shift 2 ;;
    --image)
      DOCKER_IMAGE="${2:-}"; shift 2 ;;
    --bump)
      BUMP_KIND="${2:-}"; shift 2 ;;
    --version)
      EXPLICIT_VERSION="${2:-}"; shift 2 ;;
    --version-file)
      VERSION_FILE="${2:-}"; shift 2 ;;
    --no-latest)
      TAG_LATEST="0"; shift ;;
    --no-push)
      PUSH_IMAGE="0"; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1 ;;
  esac
done

if [[ -z "$DOCKER_USER" ]]; then
  echo "Docker Hub user is required. Use --user or set DOCKERHUB_USER." >&2
  exit 1
fi

require_cmd docker
require_cmd date
require_cmd git

CURRENT_VERSION=""
if [[ -n "$EXPLICIT_VERSION" ]]; then
  if ! is_semver "$EXPLICIT_VERSION"; then
    echo "Invalid --version '$EXPLICIT_VERSION'. Expected x.y.z" >&2
    exit 1
  fi
  NEXT_VERSION="$EXPLICIT_VERSION"
else
  if [[ -f "$VERSION_FILE" ]]; then
    CURRENT_VERSION="$(tr -d '[:space:]' <"$VERSION_FILE")"
  elif [[ -f "package.json" ]]; then
    CURRENT_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "")"
  fi

  if [[ -z "$CURRENT_VERSION" ]]; then
    CURRENT_VERSION="1.0.0"
  fi
  if ! is_semver "$CURRENT_VERSION"; then
    echo "Current version '$CURRENT_VERSION' is not semver. Fix $VERSION_FILE or pass --version." >&2
    exit 1
  fi
  NEXT_VERSION="$(bump_semver "$CURRENT_VERSION" "$BUMP_KIND")"
fi

REPO="${DOCKER_USER}/${DOCKER_IMAGE}"
VERSION_TAG="v${NEXT_VERSION}"
IMAGE_VERSION="${REPO}:${VERSION_TAG}"
IMAGE_LATEST="${REPO}:latest"

GIT_REVISION="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
GIT_SOURCE="$(git config --get remote.origin.url 2>/dev/null || echo local)"
BUILD_CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Releasing image:"
echo "  Repo:     ${REPO}"
echo "  Version:  ${VERSION_TAG}"
echo "  Push:     ${PUSH_IMAGE}"
echo "  Latest:   ${TAG_LATEST}"
echo

docker build \
  --build-arg "IMAGE_SOURCE=${GIT_SOURCE}" \
  --build-arg "IMAGE_DOCUMENTATION=${GIT_SOURCE}" \
  --build-arg "IMAGE_REVISION=${GIT_REVISION}" \
  --build-arg "IMAGE_CREATED=${BUILD_CREATED}" \
  -t "${IMAGE_VERSION}" .

if [[ "$TAG_LATEST" == "1" ]]; then
  docker tag "${IMAGE_VERSION}" "${IMAGE_LATEST}"
fi

if [[ "$PUSH_IMAGE" == "1" ]]; then
  echo "Pushing ${IMAGE_VERSION}"
  docker push "${IMAGE_VERSION}"
  if [[ "$TAG_LATEST" == "1" ]]; then
    echo "Pushing ${IMAGE_LATEST}"
    docker push "${IMAGE_LATEST}"
  fi
fi

echo "${NEXT_VERSION}" >"${VERSION_FILE}"

echo
echo "Done."
echo "  ${IMAGE_VERSION}"
if [[ "$TAG_LATEST" == "1" ]]; then
  echo "  ${IMAGE_LATEST}"
fi
echo "Saved next base version in ${VERSION_FILE}"

