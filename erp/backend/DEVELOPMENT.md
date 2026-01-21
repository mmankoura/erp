# Development Guide

## WSL2 Development Environment

This project is developed on Windows using WSL2, with Node.js running as a Windows process (not inside WSL).

### Known Issue: Port Already in Use (EADDRINUSE)

When running the backend from WSL, you may encounter:
```
Error: listen EADDRINUSE: address already in use :::3002
```

**Root Cause:**
1. `npm run start:dev` spawns `node.exe` as a Windows process
2. If the WSL terminal exits, crashes, or you press Ctrl+C, the Windows `node.exe` process may not be killed
3. Multiple start attempts accumulate orphaned `node.exe` processes holding the port

**Solution - Kill orphaned Node processes:**
```bash
# From WSL, run this to kill all node.exe processes on Windows:
/mnt/c/Windows/System32/cmd.exe /c "taskkill /F /IM node.exe"

# Or use the helper script:
npm run kill-node
```

**Prevention:**
- Always use `npm run kill-node` before starting the server if you suspect orphaned processes
- Use `npm run dev` which automatically kills orphaned processes before starting

### Helper Scripts

The following npm scripts are available for WSL development:

| Script | Description |
|--------|-------------|
| `npm run kill-node` | Kills all Windows node.exe processes |
| `npm run dev` | Kills orphaned processes, then starts dev server |
| `npm run start:dev` | Standard NestJS dev server (use `dev` instead from WSL) |

### Testing API Endpoints from WSL

Since the server runs on Windows (not WSL), you have two options:

**Option 1: Use Windows curl**
```bash
/mnt/c/Windows/System32/curl.exe http://localhost:3002/api/health
```

**Option 2: Use localhost (may require WSL network config)**
```bash
curl http://localhost:3002/api/health
```

If localhost doesn't work from WSL, the Windows curl approach is more reliable.

## Database

PostgreSQL connection is configured in `.env`:
```
DATABASE_URL=postgres://erp:erp@localhost:5432/erp
PORT=3002
```

### Migrations

```bash
# Generate a new migration after entity changes
npm run migration:generate -- src/database/migrations/MigrationName

# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

## Project Structure

```
src/
├── app.module.ts           # Root module
├── main.ts                 # Application entry point
├── database/
│   └── migrations/         # TypeORM migrations
├── entities/               # Database entities
└── modules/                # Feature modules
    ├── aml/                # Approved Manufacturer List
    ├── inventory/          # Inventory management
    ├── materials/          # Material master data
    ├── purchase-orders/    # Purchase order management
    ├── receiving-inspection/ # Receiving inspection workflow
    └── ...
```
