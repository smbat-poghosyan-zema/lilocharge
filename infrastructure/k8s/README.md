# LiloCharge Kubernetes Deployment

This directory contains Kubernetes manifests for deploying LiloCharge in production.

## Prerequisites

- Kubernetes cluster (1.28+)
- kubectl configured
- cert-manager installed for SSL certificates
- sealed-secrets or external-secrets-operator for secret management
- Ingress controller (nginx-ingress recommended)
- Metrics server for HPA
- Persistent volume provisioner (cloud provider or local-path)

## Directory Structure

```
k8s/
├── namespace.yaml              # Namespace definition
├── base/                       # Base manifests
│   ├── kustomization.yaml      # Kustomize base
│   ├── configmap.yaml          # Application configuration
│   ├── secrets.yaml            # Secret templates (sealed)
│   ├── postgres/               # PostgreSQL StatefulSet
│   ├── redis/                  # Redis StatefulSet
│   ├── api/                    # API Deployment
│   └── ingress/                # Ingress configuration
├── overlays/                   # Environment-specific overlays
│   ├── dev/                    # Development environment
│   ├── staging/                # Staging environment
│   └── production/             # Production environment
└── README.md                   # This file
```

## Deployment Instructions

### 1. Install Prerequisites

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml

# Install sealed-secrets (optional)
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.26.0/controller.yaml

# Install nginx-ingress
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml
```

### 2. Create Namespace

```bash
kubectl apply -f namespace.yaml
```

### 3. Create Secrets

Create sealed secrets or use external secrets operator. Example using kubectl:

```bash
# Database credentials
kubectl create secret generic postgres-credentials \
  --from-literal=username=lilocharge \
  --from-literal=password=YOUR_SECURE_PASSWORD \
  --from-literal=database=lilocharge \
  -n lilocharge

# Redis password
kubectl create secret generic redis-credentials \
  --from-literal=password=YOUR_REDIS_PASSWORD \
  -n lilocharge

# Application secrets
kubectl create secret generic api-secrets \
  --from-literal=jwt-secret=YOUR_JWT_SECRET \
  --from-literal=arca-merchant-id=YOUR_ARCA_ID \
  --from-literal=idram-api-key=YOUR_IDRAM_KEY \
  --from-literal=mapbox-token=YOUR_MAPBOX_TOKEN \
  --from-literal=fcm-server-key=YOUR_FCM_KEY \
  -n lilocharge
```

### 4. Deploy Base Resources

```bash
# Apply base resources using kustomize
kubectl apply -k base/

# Or for specific environment
kubectl apply -k overlays/production/
```

### 5. Verify Deployment

```bash
# Check pods
kubectl get pods -n lilocharge

# Check services
kubectl get svc -n lilocharge

# Check ingress
kubectl get ingress -n lilocharge

# Check HPA
kubectl get hpa -n lilocharge
```

## Configuration

### Environment Variables

Application configuration is managed through:

- **ConfigMaps**: Non-sensitive configuration
- **Secrets**: Sensitive credentials

See `base/configmap.yaml` and `base/secrets.yaml` for details.

### Scaling

Auto-scaling is configured via HorizontalPodAutoscaler:

- **API**: 2-10 replicas based on CPU (70%) and memory (80%)

Manual scaling:

```bash
kubectl scale deployment api -n lilocharge --replicas=5
```

### SSL Certificates

TLS certificates are automatically provisioned by cert-manager using Let's Encrypt.

Update the ingress annotation in `base/ingress/ingress.yaml` to use your domain.

## Monitoring

Prometheus metrics are exposed at:

- **API**: `/metrics` endpoint (port 9464)
- **PostgreSQL**: via postgres-exporter sidecar
- **Redis**: via redis-exporter sidecar

ServiceMonitors are included for Prometheus Operator integration.

## Backup and Restore

### PostgreSQL Backup

```bash
# Create backup
kubectl exec -n lilocharge postgres-0 -- pg_dump -U lilocharge lilocharge > backup.sql

# Restore backup
kubectl exec -i -n lilocharge postgres-0 -- psql -U lilocharge lilocharge < backup.sql
```

## Troubleshooting

### View logs

```bash
kubectl logs -n lilocharge -l app=api --tail=100 -f
```

### Exec into pod

```bash
kubectl exec -it -n lilocharge api-xxxxx -- /bin/sh
```

### Check events

```bash
kubectl get events -n lilocharge --sort-by='.lastTimestamp'
```

## Security

- All secrets are stored in Kubernetes secrets (use sealed-secrets in production)
- Network policies restrict traffic between components
- Resource limits prevent resource exhaustion
- Security contexts enforce non-root user

## Maintenance

### Rolling Updates

Deployments are configured for rolling updates with zero downtime:

- maxSurge: 1
- maxUnavailable: 0

### Database Migrations

Run migrations as a Kubernetes Job:

```bash
kubectl apply -f jobs/migration-job.yaml
```
