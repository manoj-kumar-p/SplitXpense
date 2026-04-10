# SplitXpense Server

Backend for banking API integration (Account Aggregator, FCM push notifications).

## Setup

1. Install dependencies: `npm install`
2. Copy env: `cp .env.example .env`
3. Fill in credentials (see below)
4. Start: `npm run dev`

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| PORT | Server port (default 3000) | No |
| DATABASE_URL | PostgreSQL connection string | Yes |
| REDIS_URL | Redis connection string | Yes |
| FCM_SERVICE_ACCOUNT_PATH | Path to Firebase service account JSON | Yes |
| SETU_AA_CLIENT_ID | Setu AA client ID | Yes |
| SETU_AA_CLIENT_SECRET | Setu AA client secret | Yes |
| SETU_AA_BASE_URL | Setu AA API base URL | Yes |
| JWT_SECRET | JWT signing secret | Yes |

## API Endpoints

### Auth
- `POST /api/auth/register` — Register device (phone + FCM token)
- `POST /api/auth/refresh-fcm` — Update FCM token

### Account Aggregator
- `POST /api/aa/consent/create` — Create AA consent request
- `POST /api/aa/consent/status` — Check consent status
- `POST /api/aa/fi/fetch` — Fetch financial information

### Transactions
- `GET /api/transactions/pending?phone=...` — Get pending transactions
- `POST /api/transactions/dismiss/:id` — Dismiss transaction

### Webhooks (called by Setu)
- `POST /api/webhook/consent/notification` — Consent status change
- `POST /api/webhook/fi/notification` — FI data ready

### Health
- `GET /health` — Health check

## Deployment

### Docker (local)
```bash
docker-compose up -d
```

### EC2
```bash
bash deploy/ec2-setup.sh
```

### ECS Fargate
```bash
bash deploy/aws-setup.sh
bash deploy/deploy-ecr.sh
```
