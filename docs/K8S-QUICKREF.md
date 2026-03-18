# LiloCharge K8s Quick Reference

## Quick Commands

### Deployment

```bash
# Deploy to development
./scripts/k8s-deploy.sh deploy dev

# Deploy to staging
./scripts/k8s-deploy.sh deploy staging

# Deploy to production
./scripts/k8s-deploy.sh deploy production
```

### Build & Push

```bash
# Build Docker image
./scripts/k8s-deploy.sh build v1.0.0

# Push to registry
./scripts/k8s-deploy.sh push v1.0.0 registry.example.com
```

### Secrets

```bash
# Create secrets interactively
./scripts/k8s-deploy.sh secrets production
```

### Monitoring

```bash
# Check status
./scripts/k8s-deploy.sh status

# View logs
./scripts/k8s-deploy.sh logs api
./scripts/k8s-deploy.sh logs postgres
./scripts/k8s-deploy.sh logs redis
```

### Database

```bash
# Run migrations
./scripts/k8s-deploy.sh migrate

# Backup database (manual)
kubectl exec -n lilocharge postgres-0 -- pg_dump -U lilocharge lilocharge > backup.sql

# Restore database
kubectl exec -i -n lilocharge postgres-0 -- psql -U lilocharge lilocharge < backup.sql
```

### Troubleshooting

```bash
# Check pod status
kubectl get pods -n lilocharge

# Describe pod
kubectl describe pod <pod-name> -n lilocharge

# View events
kubectl get events -n lilocharge --sort-by='.lastTimestamp'

# Exec into pod
kubectl exec -it -n lilocharge <pod-name> -- /bin/sh

# Port-forward
kubectl port-forward -n lilocharge svc/api 3000:3000
kubectl port-forward -n lilocharge svc/postgres 5432:5432
kubectl port-forward -n lilocharge svc/redis 6379:6379
```

### Scaling

```bash
# Manual scale
kubectl scale deployment api -n lilocharge --replicas=5

# Check HPA
kubectl get hpa -n lilocharge

# Check resource usage
kubectl top pods -n lilocharge
kubectl top nodes
```

### Rollback

```bash
# Rollback deployment
./scripts/k8s-deploy.sh rollback production

# Check rollout status
kubectl rollout status deployment/api -n lilocharge

# View rollout history
kubectl rollout history deployment/api -n lilocharge
```

## Environment Variables

### Required Secrets

| Secret               | Key              | Description                  |
| -------------------- | ---------------- | ---------------------------- |
| postgres-credentials | username         | PostgreSQL username          |
| postgres-credentials | password         | PostgreSQL password          |
| postgres-credentials | database         | PostgreSQL database name     |
| redis-credentials    | password         | Redis password               |
| api-secrets          | jwt-secret       | JWT signing secret           |
| api-secrets          | arca-merchant-id | ArCa payment gateway ID      |
| api-secrets          | idram-api-key    | Idram payment gateway key    |
| api-secrets          | mapbox-token     | Mapbox API token             |
| api-secrets          | fcm-server-key   | Firebase Cloud Messaging key |
| api-secrets          | sentry-dsn       | Sentry error tracking DSN    |

### ConfigMap Values

| Key            | Description          | Default      |
| -------------- | -------------------- | ------------ |
| NODE_ENV       | Environment          | production   |
| LOG_LEVEL      | Logging level        | info         |
| TZ             | Timezone             | Asia/Yerevan |
| SENTRY_ENABLED | Enable Sentry        | true         |
| OTEL_ENABLED   | Enable OpenTelemetry | true         |

## Resource Limits

### Development

| Component  | CPU Request | CPU Limit | Memory Request | Memory Limit |
| ---------- | ----------- | --------- | -------------- | ------------ |
| API        | 250m        | 1000m     | 512Mi          | 1Gi          |
| PostgreSQL | 250m        | 1000m     | 512Mi          | 2Gi          |
| Redis      | 100m        | 500m      | 256Mi          | 512Mi        |

### Production

| Component  | CPU Request | CPU Limit | Memory Request | Memory Limit |
| ---------- | ----------- | --------- | -------------- | ------------ |
| API        | 250m        | 2000m     | 1Gi            | 2Gi          |
| PostgreSQL | 250m        | 2000m     | 1Gi            | 4Gi          |
| Redis      | 100m        | 500m      | 512Mi          | 1Gi          |

## Health Endpoints

| Service | Endpoint      | Port |
| ------- | ------------- | ---- |
| API     | /health       | 3000 |
| API     | /health/ready | 3000 |
| API     | /metrics      | 9464 |

## Ingress Configuration

| Environment | Domain                    | SSL Issuer          |
| ----------- | ------------------------- | ------------------- |
| Development | dev-api.lilocharge.am     | letsencrypt-staging |
| Staging     | staging-api.lilocharge.am | letsencrypt-staging |
| Production  | api.lilocharge.am         | letsencrypt-prod    |

## Auto-scaling Configuration

| Environment | Min Replicas | Max Replicas | CPU Target | Memory Target |
| ----------- | ------------ | ------------ | ---------- | ------------- |
| Development | 1            | 3            | 70%        | 80%           |
| Staging     | 1            | 5            | 70%        | 80%           |
| Production  | 2            | 10           | 70%        | 80%           |

## Backup Schedule

- **PostgreSQL**: Daily at 02:00 AM (Asia/Yerevan)
- **Retention**: 30 days
- **Location**: PVC `postgres-backup-pvc`

## Persistent Volumes

| Component  | Size (Dev) | Size (Prod) | Access Mode   |
| ---------- | ---------- | ----------- | ------------- |
| PostgreSQL | 20Gi       | 50Gi        | ReadWriteOnce |
| Redis      | 5Gi        | 10Gi        | ReadWriteOnce |
| Backups    | 50Gi       | 50Gi        | ReadWriteOnce |

## Network Policies

- **API**: Can connect to PostgreSQL, Redis, external HTTPS
- **PostgreSQL**: Only accepts connections from API
- **Redis**: Only accepts connections from API
- **All**: Can perform DNS lookups

## Useful kubectl Aliases

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
alias k='kubectl'
alias kn='kubectl -n lilocharge'
alias kgp='kubectl get pods -n lilocharge'
alias kgs='kubectl get svc -n lilocharge'
alias kgi='kubectl get ingress -n lilocharge'
alias kgh='kubectl get hpa -n lilocharge'
alias kl='kubectl logs -n lilocharge'
alias kd='kubectl describe -n lilocharge'
alias ke='kubectl exec -it -n lilocharge'
```

## Common Issues

### Pod CrashLoopBackOff

```bash
# Check pod logs
kubectl logs -n lilocharge <pod-name> --previous

# Check pod events
kubectl describe pod -n lilocharge <pod-name>
```

### ImagePullBackOff

```bash
# Check if image exists in registry
# Create image pull secret if needed
kubectl create secret docker-registry registry-creds \
  --docker-server=registry.example.com \
  --docker-username=user \
  --docker-password=pass \
  -n lilocharge
```

### Certificate Not Issued

```bash
# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager

# Check certificate status
kubectl describe certificate -n lilocharge lilocharge-tls-cert
```

## Validation

```bash
# Validate K8s manifests
cd scripts
pnpm validate:k8s
```

## CI/CD Integration

### GitLab CI Example

```yaml
deploy:production:
  stage: deploy
  image: bitnami/kubectl:latest
  script:
    - kubectl apply -k infrastructure/k8s/overlays/production/
  only:
    - tags
  when: manual
```

### GitHub Actions Example

```yaml
- name: Deploy to Production
  run: |
    kubectl apply -k infrastructure/k8s/overlays/production/
    kubectl rollout status deployment/api -n lilocharge
```

## Emergency Contacts

- **DevOps**: devops@lilocharge.am
- **On-call**: +374-XX-XXXXXX
- **Slack**: #lilocharge-ops
