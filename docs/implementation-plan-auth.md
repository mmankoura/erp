# User Roles & Authentication Implementation Plan

## Status: COMPLETED ✅

All phases implemented and working. Session-based authentication with role-based access control is fully functional.

---

## Overview

Session-based authentication with role-based access control (RBAC) for the ERP system.

**Configuration:**
- Session-based auth (not JWT)
- Admin-only user creation
- 4 roles with specific permissions
- Email is optional when creating users

## Roles & Permissions

| Role | Description | Permissions |
|------|-------------|-------------|
| **ADMIN** | Full access | Everything including user management and settings |
| **MANAGER** | Supervisor | Full access EXCEPT settings/user management |
| **WAREHOUSE_CLERK** | Inventory operations | Receiving, kitting, pick/issue, return to stock, cycle counts |
| **OPERATOR** | View only | Can view orders, inventory, kitted materials - NO editing |

### Detailed Permission Matrix

| Feature | Admin | Manager | Warehouse Clerk | Operator |
|---------|-------|---------|-----------------|----------|
| User Management | Yes | No | No | No |
| Settings | Yes | No | No | No |
| Materials/Products/BOMs - View | Yes | Yes | Yes | Yes |
| Materials/Products/BOMs - Edit | Yes | Yes | No | No |
| Orders - View | Yes | Yes | Yes | Yes |
| Orders - Create/Edit | Yes | Yes | No | No |
| Purchase Orders - View | Yes | Yes | Yes | Yes |
| Purchase Orders - Create/Edit | Yes | Yes | No | No |
| Receiving/Inspection | Yes | Yes | Yes | No |
| Kitting/Picking | Yes | Yes | Yes | No |
| Return to Stock | Yes | Yes | Yes | No |
| Cycle Counts | Yes | Yes | Yes | No |
| Inventory Adjustments | Yes | Yes | No | No |
| View Reports/MRP | Yes | Yes | Yes | Yes |
| Audit Log - View | Yes | Yes | Yes | Yes |

---

## Implementation Status

### Phase 1: Backend Foundation ✅ COMPLETED

- [x] Install dependencies (passport, express-session, bcrypt, connect-pg-simple)
- [x] Create migration for users table
- [x] Create User entity with UserRole enum
- [x] Add SESSION_SECRET to env validation
- [x] Update main.ts with session middleware and passport

### Phase 2: Auth Module ✅ COMPLETED

- [x] Create auth module structure
- [x] LocalStrategy for username/password auth
- [x] AuthenticatedGuard for session validation
- [x] RolesGuard for permission checking
- [x] @CurrentUser(), @Roles(), @Public() decorators
- [x] All auth endpoints (login, logout, me, users CRUD)

### Phase 3: Protect Existing Routes ✅ COMPLETED

- [x] Add guards to all controllers
- [x] Apply @Roles decorators per permission matrix
- [x] HealthController marked as @Public()

### Phase 4: Frontend Auth ✅ COMPLETED

- [x] Auth context with useAuth hook
- [x] API client with credentials: "include"
- [x] Login page with redirect
- [x] Layout wrapped with AuthProvider
- [x] Next.js proxy/rewrite for same-origin cookies (SameSite=Lax)

### Phase 5: Frontend Role-Based UI ✅ COMPLETED

- [x] Sidebar shows user info and role badge
- [x] Settings/Users links hidden for non-admins
- [x] Logout button in sidebar
- [x] canEdit() checks on all edit/delete buttons
- [x] User management page for admins

### Phase 6: Initial Setup & Testing ✅ COMPLETED

- [x] Admin user seeded (username: admin)
- [x] All role scenarios tested and working

---

## Recent Bug Fixes (Feb 2026)

### Session Cookie Issues
- **Problem**: Session cookies not being sent with requests
- **Root cause**: SameSite=None requires Secure=true, but dev is HTTP
- **Solution**: Changed to SameSite=Lax + Next.js proxy so all requests are same-origin

### Edit Dialog Navigation Bug
- **Problem**: Clicking edit button or typing in edit dialog navigated to detail page
- **Root cause**: Click/keyboard events propagating to DataTable row click handler
- **Solution**: Added stopPropagation to edit button triggers and DialogContent

### Email Validation
- **Problem**: Empty email string caused validation error
- **Solution**: Made email optional, frontend filters out empty strings

### BOM Import Customer Assignment
- **Problem**: Materials created during BOM import had no customer_id
- **Solution**: Auto-assign product's customer_id to newly created materials

### Dashboard Shortages Not Displaying
- **Problem**: Shortages card showed "No shortages" even when shortages existed
- **Root cause**: Dashboard expected MrpShortage[] but API returns MrpShortagesResponse wrapper
- **Solution**: Extract shortages array from response object

---

## Key Files

### Backend Auth
- `backend/src/modules/auth/` - Complete auth module
- `backend/src/entities/user.entity.ts` - User entity + UserRole enum
- `backend/src/main.ts` - Session middleware configuration

### Frontend Auth
- `frontend/src/contexts/auth-context.tsx` - Auth context & useAuth hook
- `frontend/src/app/login/page.tsx` - Login page
- `frontend/src/app/settings/users/page.tsx` - User management
- `frontend/next.config.ts` - API proxy rewrites

---

## Environment Variables

```
SESSION_SECRET=<32+ character random string>
```

---

## Default Admin Credentials

- **Username**: admin
- **Password**: admin123 (change after first login)

---

## Notes for Future Development

1. **Adding new protected routes**: Use `@UseGuards(AuthenticatedGuard, RolesGuard)` and `@Roles(UserRole.X)`
2. **Adding new UI with edit controls**: Use `const { canEdit } = useAuth()` and conditionally render
3. **Session expiry**: Sessions expire based on cookie maxAge (configured in main.ts)
4. **Password requirements**: Currently basic - consider adding complexity rules for production
