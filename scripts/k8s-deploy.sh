#!/bin/bash
set -e

# K8s deployment helper scripts for LiloCharge

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "${SCRIPT_DIR}/../infrastructure/k8s" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi
    
    if ! command -v kustomize &> /dev/null; then
        log_warn "kustomize not found. Using kubectl's built-in kustomize."
    fi
    
    log_info "Prerequisites check passed."
}

build_image() {
    local tag=${1:-latest}
    log_info "Building Docker image with tag: ${tag}"
    
    cd "${SCRIPT_DIR}/.."
    docker build -f apps/api/Dockerfile -t lilocharge/api:${tag} .
    
    log_info "Image built successfully: lilocharge/api:${tag}"
}

push_image() {
    local tag=${1:-latest}
    local registry=${2:-}
    
    if [ -n "${registry}" ]; then
        local full_image="${registry}/lilocharge/api:${tag}"
        log_info "Tagging image as ${full_image}"
        docker tag lilocharge/api:${tag} ${full_image}
        
        log_info "Pushing image to registry..."
        docker push ${full_image}
    else
        log_error "Registry not specified. Usage: $0 push <tag> <registry>"
        exit 1
    fi
    
    log_info "Image pushed successfully."
}

deploy_env() {
    local env=${1:-dev}
    
    if [ ! -d "${K8S_DIR}/overlays/${env}" ]; then
        log_error "Environment '${env}' not found in overlays."
        exit 1
    fi
    
    log_info "Deploying to ${env} environment..."
    
    kubectl apply -k "${K8S_DIR}/overlays/${env}"
    
    log_info "Deployment to ${env} completed."
    log_info "Checking rollout status..."
    
    kubectl rollout status deployment/api -n lilocharge --timeout=5m
    
    log_info "Deployment successful!"
}

rollback_deployment() {
    local env=${1:-production}
    
    log_warn "Rolling back API deployment in ${env}..."
    
    kubectl rollout undo deployment/api -n lilocharge
    
    log_info "Rollback initiated. Checking status..."
    kubectl rollout status deployment/api -n lilocharge --timeout=5m
    
    log_info "Rollback completed."
}

create_secrets() {
    local env=${1:-dev}
    
    log_info "Creating secrets for ${env} environment..."
    
    read -sp "Enter PostgreSQL password: " POSTGRES_PASSWORD
    echo
    read -sp "Enter Redis password: " REDIS_PASSWORD
    echo
    # ── Auth (both REQUIRED — the API 500s on every login without the refresh secret) ──
    read -sp "Enter JWT secret: " JWT_SECRET
    echo
    read -sp "Enter refresh-token secret: " REFRESH_TOKEN_SECRET
    echo
    # ── Payments: ArCa / Idram (webhook secrets REQUIRED — callbacks 503 without them) ──
    read -sp "Enter ArCa API key: " ARCA_API_KEY
    echo
    read -p "Enter ArCa merchant ID: " ARCA_MERCHANT_ID
    read -sp "Enter ArCa webhook secret: " ARCA_WEBHOOK_SECRET
    echo
    read -sp "Enter Idram API key: " IDRAM_API_KEY
    echo
    read -sp "Enter Idram webhook secret: " IDRAM_WEBHOOK_SECRET
    echo
    # ── Payments: Apple Pay / Google Pay (optional) ──
    read -sp "Enter Apple Pay API key (optional): " APPLE_PAY_API_KEY
    echo
    read -sp "Enter Google Pay API key (optional): " GOOGLE_PAY_API_KEY
    echo
    # ── SMS / OTP (REQUIRED in prod or phone registration is dead) ──
    read -p "Enter Twilio account SID: " TWILIO_ACCOUNT_SID
    read -sp "Enter Twilio auth token: " TWILIO_AUTH_TOKEN
    echo
    read -p "Enter SMS from number (e.g. +374...): " SMS_FROM_NUMBER
    # ── Push notifications (Firebase Admin service account) ──
    read -p "Enter FCM project ID: " FCM_PROJECT_ID
    read -p "Enter FCM client email: " FCM_CLIENT_EMAIL
    read -sp "Enter FCM private key (\\n-escaped PEM): " FCM_PRIVATE_KEY
    echo
    # ── Uploads (S3-compatible presigning; endpoints 503 without these) ──
    read -p "Enter uploads S3 access key ID: " UPLOADS_S3_ACCESS_KEY_ID
    read -sp "Enter uploads S3 secret access key: " UPLOADS_S3_SECRET_ACCESS_KEY
    echo
    # ── OCPP basic-auth identity map (JSON: {"chargePointId":"secret"}) ──
    read -p "Enter OCPP identity secrets JSON: " OCPP_IDENTITY_SECRETS
    # ── Observability ──
    read -p "Enter Sentry DSN (optional): " SENTRY_DSN

    # Create PostgreSQL secret
    kubectl create secret generic postgres-credentials \
        --from-literal=username=lilocharge \
        --from-literal=password="${POSTGRES_PASSWORD}" \
        --from-literal=database=lilocharge \
        -n lilocharge \
        --dry-run=client -o yaml | kubectl apply -f -

    # Create Redis secret
    kubectl create secret generic redis-credentials \
        --from-literal=password="${REDIS_PASSWORD}" \
        -n lilocharge \
        --dry-run=client -o yaml | kubectl apply -f -

    # Create API secrets
    kubectl create secret generic api-secrets \
        --from-literal=jwt-secret="${JWT_SECRET}" \
        --from-literal=refresh-token-secret="${REFRESH_TOKEN_SECRET}" \
        --from-literal=arca-api-key="${ARCA_API_KEY}" \
        --from-literal=arca-merchant-id="${ARCA_MERCHANT_ID}" \
        --from-literal=arca-webhook-secret="${ARCA_WEBHOOK_SECRET}" \
        --from-literal=idram-api-key="${IDRAM_API_KEY}" \
        --from-literal=idram-webhook-secret="${IDRAM_WEBHOOK_SECRET}" \
        --from-literal=apple-pay-api-key="${APPLE_PAY_API_KEY}" \
        --from-literal=google-pay-api-key="${GOOGLE_PAY_API_KEY}" \
        --from-literal=twilio-account-sid="${TWILIO_ACCOUNT_SID}" \
        --from-literal=twilio-auth-token="${TWILIO_AUTH_TOKEN}" \
        --from-literal=sms-from-number="${SMS_FROM_NUMBER}" \
        --from-literal=fcm-project-id="${FCM_PROJECT_ID}" \
        --from-literal=fcm-client-email="${FCM_CLIENT_EMAIL}" \
        --from-literal=fcm-private-key="${FCM_PRIVATE_KEY}" \
        --from-literal=uploads-s3-access-key-id="${UPLOADS_S3_ACCESS_KEY_ID}" \
        --from-literal=uploads-s3-secret-access-key="${UPLOADS_S3_SECRET_ACCESS_KEY}" \
        --from-literal=ocpp-identity-secrets="${OCPP_IDENTITY_SECRETS}" \
        --from-literal=sentry-dsn="${SENTRY_DSN}" \
        -n lilocharge \
        --dry-run=client -o yaml | kubectl apply -f -

    log_info "Secrets created successfully."
}

show_status() {
    log_info "Current deployment status:"
    echo
    
    log_info "Pods:"
    kubectl get pods -n lilocharge
    echo
    
    log_info "Services:"
    kubectl get svc -n lilocharge
    echo
    
    log_info "Ingress:"
    kubectl get ingress -n lilocharge
    echo
    
    log_info "HPA:"
    kubectl get hpa -n lilocharge
    echo
    
    log_info "PVCs:"
    kubectl get pvc -n lilocharge
}

show_logs() {
    local pod_filter=${1:-api}
    
    log_info "Showing logs for ${pod_filter}..."
    kubectl logs -n lilocharge -l app.kubernetes.io/name=${pod_filter} --tail=100 -f
}

run_migration() {
    log_info "Running database migrations..."
    
    # Get the first API pod
    local pod=$(kubectl get pods -n lilocharge -l app.kubernetes.io/name=api -o jsonpath='{.items[0].metadata.name}')
    
    if [ -z "${pod}" ]; then
        log_error "No API pod found."
        exit 1
    fi
    
    log_info "Running migrations on pod: ${pod}"
    kubectl exec -it -n lilocharge ${pod} -- pnpm prisma:migrate deploy
    
    log_info "Migrations completed."
}

# Main script
case "${1}" in
    check)
        check_prerequisites
        ;;
    build)
        check_prerequisites
        build_image "${2:-latest}"
        ;;
    push)
        check_prerequisites
        push_image "${2}" "${3}"
        ;;
    deploy)
        check_prerequisites
        deploy_env "${2:-dev}"
        ;;
    rollback)
        check_prerequisites
        rollback_deployment "${2:-production}"
        ;;
    secrets)
        check_prerequisites
        create_secrets "${2:-dev}"
        ;;
    status)
        check_prerequisites
        show_status
        ;;
    logs)
        check_prerequisites
        show_logs "${2:-api}"
        ;;
    migrate)
        check_prerequisites
        run_migration
        ;;
    *)
        echo "Usage: $0 {check|build|push|deploy|rollback|secrets|status|logs|migrate}"
        echo
        echo "Commands:"
        echo "  check                    - Check prerequisites"
        echo "  build [tag]             - Build Docker image (default: latest)"
        echo "  push <tag> <registry>   - Push Docker image to registry"
        echo "  deploy [env]            - Deploy to environment (dev|staging|production)"
        echo "  rollback [env]          - Rollback deployment"
        echo "  secrets [env]           - Create secrets interactively"
        echo "  status                  - Show deployment status"
        echo "  logs [component]        - Show logs (default: api)"
        echo "  migrate                 - Run database migrations"
        exit 1
        ;;
esac
