# SplitXpense

Local-first expense splitter for Android — like Splitwise, but works without internet.

## Features

### Core
- Create groups, add members, track expenses
- 4 split types: Equal, Unequal, By Shares, By Percentage
- Multi-payer support
- Settlements tracking
- Friends tab with cross-group balance aggregation
- Activity log with timeline view
- Statistics with category/group breakdown
- Light/dark/auto theme

### Sync (No Server Required)
- WiFi LAN sync (mDNS discovery + HTTP)
- SMS sync (compact protocol, works on 2G)
- Bluetooth LE Nearby sync
- CRDT-based conflict resolution (HLC + vector clocks)

### Auto Transaction Detection
- **SMS parsing** — Detects bank debit/credit alerts
- **Push notification reading** — Intercepts UPI app notifications (GPay, PhonePe, Paytm)
- **Email sync** — Gmail API integration for bank transaction emails
- **Account Aggregator** — Setu AA integration for automatic bank statement fetching
- **Background detection** — WorkManager for background SMS scanning
- **Account-to-group mapping** — Auto-route transactions to the right group
- **Quick Add** — Tap notification -> pre-filled expense form

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.84 + TypeScript |
| Database | SQLite (op-sqlite, JSI) |
| Navigation | React Navigation (bottom tabs + native stack) |
| State | Zustand |
| Notifications | Notifee |
| SMS | react-native-android-sms-listener |
| BLE | react-native-ble-plx |
| WiFi | react-native-zeroconf + tcp-socket |
| UI | Custom B&W component library |
| Server | Node.js + Express + PostgreSQL + Redis |
| Banking API | Setu Account Aggregator (AA) |
| Push | Firebase Cloud Messaging (FCM) |

## Project Structure

```
src/
├── app/              # App entry, navigation
├── components/ui/    # Shared UI components (11)
├── db/               # SQLite schema, queries
├── models/           # TypeScript interfaces
├── notifications/    # Notifee channels, handlers
├── screens/          # All app screens
├── sync/             # P2P sync (WiFi, SMS, BLE)
├── theme/            # Colors, fonts, spacing, radii
├── transaction/      # Auto transaction detection
│   ├── api/          # Server sync
│   └── email/        # Gmail integration
├── types/            # Navigation types, vendor types
└── utils/            # Helpers (currency, categories, etc.)
server/
├── src/
│   ├── db/           # PostgreSQL + Redis
│   ├── routes/       # API endpoints
│   └── services/     # AA client, FCM, scheduler
└── deploy/           # Docker, AWS scripts
```

## Getting Started

### Prerequisites
- Node.js 20+
- Android Studio + SDK
- JDK 17

### Setup
```bash
npm install
npx react-native run-android
```

### Server (optional, for banking API features)
```bash
cd server
npm install
cp .env.example .env  # Fill in credentials
npm run dev
```

### AWS Deployment
```bash
cd server
# EC2 (single instance)
bash deploy/ec2-setup.sh

# ECS Fargate (auto-scaling)
bash deploy/aws-setup.sh
bash deploy/deploy-ecr.sh
```

## Shared UI Components

| Component | Description |
|-----------|-------------|
| AppButton | Primary/secondary/danger/outline with scale animation |
| AppInput | Labeled text input with theme support |
| AppCard | Bordered surface card |
| AppAvatar | Circular initial avatar (xs/sm/md/lg) |
| Chip | Selectable pill toggle |
| BottomSheet | Modal sheet with handle bar |
| ListRow | Icon + label + value menu row |
| SectionHeader | Uppercase section title |
| Divider | Hairline separator |
| EmptyState | Icon + title + subtitle + CTA |
| FadeInView | Entrance animation wrapper |

## License

MIT
