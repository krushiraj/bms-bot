# BMS Bot

Automated movie ticket booking for BookMyShow via Telegram bot.

## Features

- Telegram bot interface for creating booking jobs
- Gift card management with encryption
- Watch mode: monitors BMS for ticket availability
- Smart seat selection algorithm
- Automatic booking when tickets go live

## Setup

### Prerequisites

- Node.js 20+
- Docker (for local Postgres + Redis)
- Telegram Bot Token (from @BotFather)

### Local Development

1. Start databases:
   ```bash
   docker-compose up -d
   ```

2. Create `.env` from example:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. Generate encryption key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Setup database:
   ```bash
   yarn db:push
   ```

5. Run in development:
   ```bash
   yarn dev
   ```

### Deployment (Railway)

1. Create new Railway project
2. Add PostgreSQL and Redis services
3. Connect GitHub repo
4. Set environment variables
5. Deploy!

## Commands

| Command | Description |
|---------|-------------|
| /start | Register and get welcome message |
| /help | Show available commands |
| /newjob | Create a new booking job |
| /myjobs | List your booking jobs |
| /addcard | Add a gift card |
| /mycards | List your gift cards |

## Architecture

See [Design Document](docs/plans/2025-12-25-bms-automation-design.md) for full details.
