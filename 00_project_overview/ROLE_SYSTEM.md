# TFOS Role System — Platform & Access Control Design

## Overview

Two distinct authenticated roles exist on the platform. Role is stored in
`tenant.users.role` and embedded in every JWT as `role`. All access control
is enforced at three layers: JWT middleware, FastAPI route dependencies, and
React frontend routing (admin tabs are **completely absent from the DOM** for
farmer accounts — not hidden, not greyed out, not rendered at all).

---

## Role 1: Admin (`role = "ADMIN"`)

Assigned only to Teivaka team accounts. Never self-registered — created
directly in the database by the platform operator.

### Visual Identity
- Gold **"A"** badge displayed next to username everywhere on the platform.

### Routes accessible
| Route | Description |
|---|---|
| `/admin` | Admin Dashboard |
| `/admin/users` | User management |
| `/admin/content` | Content moderation |
| `/admin/analytics` | Platform analytics |
| `/admin/settings` | Platform settings |
| All farmer routes | Admin can access everything a farmer sees |

### Admin Dashboard (`/admin`)
- **Live stats strip (top row):** Total Farmers, Online Now, New Today,
  Posts Today, AI Queries Today, Farms Active — all real-time
- **Alert cards (row 2, clickable):** Flagged Posts count, Pending Approvals,
  Reported Users, Support Requests
- **Main area:** Activity feed (identical to farmer feed) but every post has
  admin action buttons: Delete / Warn User / Pin / Feature / Change Category
- **Right panel:** Platform health charts — signups sparkline, DAU bar chart,
  top crops list, most active farmers, top KB articles

### Admin Users Tab (`/admin/users`)
- Full paginated table: Avatar, Name, Farm Name, Location, Joined, Last Active,
  Rank, Status (Active / Suspended / Banned / Pending)
- Row actions: View Profile, View Farm Data, Message, Change Rank, Suspend,
  Ban, Reset Password, Verify
- Filter bar: All / Online / New This Week / Suspended / Banned / By Country /
  By Crop / By Rank
- Bulk select → Send Announcement / Export CSV / Suspend Selected

### Admin Content Tab (`/admin/content`)
- **Flagged Posts queue:** preview, flag count, reason, actions: Keep / Delete /
  Warn / Ban
- **KB pending submissions:** Preview / Approve / Reject / Edit
- **Pinned Content manager:** drag-and-drop reorder, announcement banner editor

### Admin Analytics Tab (`/admin/analytics`)
- Platform growth line graph, signups by country bar chart
- D1 / D7 / D30 retention table
- Engagement: posts / comments / AI queries / KB reads / farm sessions per day
- Geographic heatmap overlay
- Subscription breakdown by tier

### Admin Map View
- Same base map as farmers but with:
  - Heatmap density overlay
  - All dots visible (opted-out users = anonymous gray dot, no profile data)
  - Dot colour = subscription tier (Free=gray, Basic=green, Premium=gold,
    Partner=blue)
  - Filter by tier / crop / date / activity
  - Export to CSV

### Admin Platform Settings (`/admin/settings`)
- Community name, tagline, banner image
- Announcement banner toggle + text
- Rank configuration
- Post categories & KB categories
- Subscription tier definitions
- Email notification templates
- Onboarding flow editor
- Feature flags per tier

---

## Role 2: Farmer (`role = "FARMER"`)

All registered non-admin users. Self-registered via `/register`.

### Routes accessible
| Route | Description |
|---|---|
| `/` | Community feed |
| `/kb` | Knowledge Base |
| `/farm` | Their own Farm Manager only |
| `/tis` | AI Assistant |
| `/calendar` | Farm calendar |
| `/members` | Members directory (public profiles only) |
| `/map` | Map (public dots + privacy-respecting) |
| `/leaderboard` | Community leaderboard |

### Farmer does NOT see
- Admin Dashboard, Users tab, Content tab, Analytics tab, Platform Settings tab
- Any other farmer's private farm data
- Flagged content status or moderation queue
- Subscription revenue data
- Any moderation tools

### Farmer content controls
- Own posts only: Edit, Delete, Toggle notifications, Change category
- Can flag any post → sends to admin moderation queue **silently**
- Cannot see queue or moderation status

---

## Access Control Rules

### Backend
- All `/api/v1/admin/*` routes require `role = "ADMIN"` via `require_role("ADMIN")` dependency
- 403 Forbidden returned to any non-admin attempting admin routes
- Admin accounts can call all farmer routes (superset access)
- RLS still applies: admin accounts operate within their own tenant context
  unless using the superadmin DB connection

### Frontend
- Admin route components wrapped in `<AdminRoute>` guard
- Non-admin hitting `/admin/*` redirected to `/403`
- **Admin navigation tabs are completely absent from farmer DOM** — not
  conditionally hidden, not CSS-hidden, not rendered at all — they do not
  exist in the React tree for farmer sessions

### JWT
Admin role is embedded in the token:
```json
{
  "sub": "user_id",
  "tenant_id": "uuid",
  "role": "ADMIN",
  "tier": "ENTERPRISE",
  "type": "access"
}
```
Frontend reads `role` from decoded JWT to determine which navigation and
routes to render at initial load.

---

## Creating an Admin Account

Admin accounts are never self-registered. Insert directly:

```sql
-- 1. Create tenant for Teivaka admin
INSERT INTO tenant.tenants (tenant_id, company_name, subscription_tier, tis_daily_limit)
VALUES (gen_random_uuid(), 'Teivaka Admin', 'ENTERPRISE', 999);

-- 2. Create admin user (bcrypt hash for your chosen password)
INSERT INTO tenant.users (
    user_id, tenant_id, email, full_name, first_name, last_name,
    password_hash, role, account_type, phone_number,
    privacy_accepted_at, privacy_policy_version,
    email_verified, is_active
) VALUES (
    gen_random_uuid(), '<tenant_id_above>', 'admin@teivaka.com',
    'Cody Teivaka', 'Cody', 'Teivaka',
    '<bcrypt_hash>', 'ADMIN', 'OTHER', '+6798730866',
    NOW(), '1.0', true, true
);
```
