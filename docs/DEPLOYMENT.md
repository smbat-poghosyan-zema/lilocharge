# Production Deployment Guide

## Overview

This guide covers deploying LiloCharge to production using Kubernetes. The infrastructure is designed for high availability, security, and scalability.

## Architecture

```
┌─────────────────┐
│   Ingress       │  HTTPS (cert-manager + Let's Encrypt)
│  (nginx)        │  Rate limiting, CORS
└────────┬────────┘
         │
┌────────▼────────┐
│   API Service   │  Auto-scaling (2-10 replicas)
│  (NestJS)       │  Health checks, Metrics
└────┬────────┬───┘
     │        │
┌────▼────┐ ┌▼──────────┐
│ PostgreSQL│ Redis      │
│ (TimescaleDB)│ (Cache) │
└───────────┘ └──────────┘
```

## Prerequisites

### Required Tools

- **kubectl** (v1.28+): Kubernetes CLI
- **kustomize** (v5.0+): Configuration management
- **docker**: Container runtime
- **pnpm**: Package manager

### Cluster Requirements

- Kubernetes cluster v1.28+
- At least 3 worker nodes (for HA)
- Persistent volume provisioner
- LoadBalancer support (cloud provider or MetalLB)
- Minimum resources per node:
  - CPU: 4 cores
  - RAM: 8GB
  - Storage: 100GB

### Required Add-ons

1. **cert-manager** (SSL certificates)
2. **nginx-ingress** (Ingress controller)
3. **metrics-server** (HPA support)
4. **sealed-secrets** or **external-secrets** (Secret management)

## Installation Steps

### 1. Install Prerequisites

#### cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml

# Verify installation
kubectl get pods -n cert-manager
```

#### nginx-ingress

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml

# Verify installation
kubectl get pods -n ingress-nginx
```

#### metrics-server

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Verify installation
kubectl top nodes
```

#### sealed-secrets

```bash
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.26.0/controller.yaml

# Install kubeseal CLI
wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.26.0/kubeseal-linux-amd64 -O kubeseal
chmod +x kubeseal
sudo mv kubeseal /usr/local/bin/
```

### 2. Build and Push Docker Image

```bash
# Build the API image
cd /path/to/lilocharge
./scripts/k8s-deploy.sh build v1.0.0

# Tag and push to your registry
docker tag lilocharge/api:v1.0.0 your-registry.com/lilocharge/api:v1.0.0
docker push your-registry.com/lilocharge/api:v1.0.0
```

Or use the script:

```bash
./scripts/k8s-deploy.sh push v1.0.0 your-registry.com
```

### 3. Create Namespace

```bash
kubectl apply -f infrastructure/k8s/namespace.yaml
```

### 4. Create Secrets

#### Option A: Interactive Script

```bash
./scripts/k8s-deploy.sh secrets production
```

#### Option B: Manual Creation

```bash
# PostgreSQL credentials
kubectl create secret generic postgres-credentials \
  --from-literal=username=lilocharge \
  --from-literal=password=YOUR_SECURE_PASSWORD \
  --from-literal=database=lilocharge \
  -n lilocharge

# Redis password
kubectl create secret generic redis-credentials \
  --from-literal=password=YOUR_REDIS_PASSWORD \
  -n lilocharge

# API secrets
kubectl create secret generic api-secrets \
  --from-literal=jwt-secret=YOUR_JWT_SECRET \
  --from-literal=arca-merchant-id=YOUR_ARCA_ID \
  --from-literal=idram-api-key=YOUR_IDRAM_KEY \
  --from-literal=mapbox-token=YOUR_MAPBOX_TOKEN \
  --from-literal=fcm-server-key=YOUR_FCM_KEY \
  --from-literal=sentry-dsn=YOUR_SENTRY_DSN \
  -n lilocharge
```

#### Option C: Sealed Secrets (Recommended)

```bash
# Create secret manifest
cat > secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: api-secrets
  namespace: lilocharge
stringData:
  jwt-secret: YOUR_JWT_SECRET
  arca-merchant-id: YOUR_ARCA_ID
  # ... other secrets
EOF

# Seal the secret
kubeseal --format=yaml < secret.yaml > sealed-secret.yaml

# Apply sealed secret
kubectl apply -f sealed-secret.yaml

# Clean up plain secret
rm secret.yaml
```

### 5. Update Kustomization

Edit `infrastructure/k8s/overlays/production/kustomization.yaml`:

```yaml
images:
  - name: lilocharge/api
    newName: your-registry.com/lilocharge/api
    newTag: v1.0.0
```

### 6. Deploy to Production

```bash
# Apply all resources
kubectl apply -k infrastructure/k8s/overlays/production/

# Or use the script
./scripts/k8s-deploy.sh deploy production
```

### 7. Run Database Migrations

```bash
# Using the migration job
kubectl apply -f infrastructure/k8s/jobs/migration-job.yaml

# Check job status
kubectl get jobs -n lilocharge
kubectl logs -n lilocharge job/prisma-migrate

# Or run directly on a pod
./scripts/k8s-deploy.sh migrate
```

### 8. Verify Deployment

```bash
# Check all resources
./scripts/k8s-deploy.sh status

# Or manually
kubectl get pods -n lilocharge
kubectl get svc -n lilocharge
kubectl get ingress -n lilocharge
kubectl get hpa -n lilocharge
```

### 9. Configure DNS

Get the LoadBalancer IP:

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller
```

Create an A record pointing `api.lilocharge.am` to the LoadBalancer IP.

### 10. Verify SSL Certificate

```bash
# Check certificate status
kubectl get certificate -n lilocharge
kubectl describe certificate lilocharge-tls-cert -n lilocharge

# Test HTTPS
curl -v https://api.lilocharge.am/health
```

## Post-Deployment

### Enable Backups

```bash
# Deploy backup CronJob
kubectl apply -f infrastructure/k8s/jobs/backup-cronjob.yaml

# Verify CronJob
kubectl get cronjobs -n lilocharge
```

### Configure Monitoring

If using Prometheus Operator:

```bash
# ServiceMonitors are already included
kubectl get servicemonitors -n lilocharge
```

### Set Up Alerts

Create PrometheusRule for alerts (example):

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: lilocharge-alerts
  namespace: lilocharge
spec:
  groups:
    - name: lilocharge
      interval: 30s
      rules:
        - alert: APIHighErrorRate
          expr: sum(rate(http_requests_total{status=~"5.."}[5m])) > 0.05
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: High error rate in API
```

## Maintenance

### Rolling Updates

```bash
# Update image tag in kustomization
# Then apply
kubectl apply -k infrastructure/k8s/overlays/production/

# Monitor rollout
kubectl rollout status deployment/api -n lilocharge
```

### Rollback

```bash
# Rollback to previous version
./scripts/k8s-deploy.sh rollback production

# Or manually
kubectl rollout undo deployment/api -n lilocharge
```

### Scaling

```bash
# Manual scaling
kubectl scale deployment api -n lilocharge --replicas=5

# HPA is configured for auto-scaling (2-10 replicas)
kubectl get hpa -n lilocharge
```

### Logs

```bash
# View API logs
./scripts/k8s-deploy.sh logs api

# View specific pod logs
kubectl logs -n lilocharge <pod-name> -f

# View all pods in namespace
kubectl logs -n lilocharge -l app.kubernetes.io/name=api --tail=100 -f
```

### Database Operations

#### Backup

```bash
# Manual backup
kubectl exec -n lilocharge postgres-0 -- pg_dump -U lilocharge lilocharge > backup-$(date +%Y%m%d).sql
```

#### Restore

```bash
# Restore from backup
kubectl exec -i -n lilocharge postgres-0 -- psql -U lilocharge lilocharge < backup-20240217.sql
```

#### Connect to Database

```bash
# Port-forward to PostgreSQL
kubectl port-forward -n lilocharge svc/postgres 5432:5432

# Connect with psql
psql -h localhost -U lilocharge -d lilocharge
```

### Redis Operations

```bash
# Connect to Redis
kubectl exec -it -n lilocharge redis-0 -- redis-cli

# Check cache stats
kubectl exec -n lilocharge redis-0 -- redis-cli INFO stats
```

## Troubleshooting

### Pod Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n lilocharge

# Check events
kubectl get events -n lilocharge --sort-by='.lastTimestamp'
```

### Image Pull Errors

```bash
# Create registry secret
kubectl create secret docker-registry registry-creds \
  --docker-server=your-registry.com \
  --docker-username=your-username \
  --docker-password=your-password \
  -n lilocharge

# Update deployment to use imagePullSecrets
```

### Certificate Issues

```bash
# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager

# Delete and recreate certificate
kubectl delete certificate lilocharge-tls-cert -n lilocharge
kubectl apply -k infrastructure/k8s/overlays/production/
```

### Database Connection Issues

```bash
# Check if postgres is ready
kubectl exec -n lilocharge postgres-0 -- pg_isready

# Check database logs
kubectl logs -n lilocharge postgres-0
```

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use sealed-secrets** or external-secrets-operator
3. **Enable RBAC** and create service accounts with minimal permissions
4. **Enable Pod Security Policies** or Pod Security Standards
5. **Regular security updates**: Update base images monthly
6. **Network policies**: Already configured to restrict traffic
7. **TLS everywhere**: API, database connections
8. **Regular backups**: Automated daily backups configured
9. **Secret rotation**: Rotate secrets quarterly
10. **Audit logs**: Enable Kubernetes audit logging

## Performance Tuning

### API Optimization

- **HPA**: Auto-scales based on CPU (70%) and memory (80%)
- **Resource limits**: Set appropriate limits in production overlay
- **Connection pooling**: Configured in Prisma

### Database Optimization

- **Indexes**: Ensure all foreign keys and frequently queried columns are indexed
- **Vacuum**: Run VACUUM ANALYZE periodically
- **Connection pooling**: Use PgBouncer if needed

### Redis Optimization

- **Memory limits**: Set appropriate maxmemory and eviction policies
- **Persistence**: RDB snapshots configured

## Disaster Recovery

### Backup Strategy

- **Database**: Daily automated backups (kept for 30 days)
- **Configuration**: All K8s manifests in git
- **Secrets**: Sealed secrets in git (encrypted)

### Recovery Procedures

1. **Application failure**: Auto-restart by Kubernetes
2. **Database corruption**: Restore from latest backup
3. **Cluster failure**: Deploy to new cluster from git
4. **Data center failure**: Multi-region setup (future enhancement)

## Cost Optimization

- **Auto-scaling**: Reduces costs during low traffic
- **Resource limits**: Prevents over-provisioning
- **Spot instances**: Use for non-critical workloads
- **Storage**: Use appropriate storage classes

## Compliance

- **GDPR**: User data encryption at rest and in transit
- **PCI DSS**: No raw card data stored (tokenized payments)
- **Audit logging**: All operations logged
- **Data retention**: Configurable retention policies

## Support

For issues or questions:

- Create an issue in the repository
- Contact: devops@lilocharge.am
- Slack: #lilocharge-ops
