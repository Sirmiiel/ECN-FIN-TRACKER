# ECN Finance Tracker — API Documentation

**Base URL:** `http://localhost:5001/api`

**Auth:** All endpoints (except Login) require a `Bearer` token in the `Authorization` header.

```
Authorization: Bearer <jwt_token>
```

---

## Table of Contents

1. [Health Check](#health-check)
2. [Authentication](#authentication)
   - [Login](#post-authlogin)
   - [Register User (Admin)](#post-authregister)
   - [Get Profile](#get-authprofile)
   - [Change PIN](#put-authchange-pin)
3. [Payments](#payments)
   - [Preview Allocation](#get-paymentspreview)
   - [Contribution Calendar](#get-paymentscalendar)
   - [Submit Payment](#post-paymentssubmit)
   - [Payment History](#get-paymentshistory)
   - [Get Single Payment](#get-paymentspaymentid)
   - [Pending Payments (Admin)](#get-paymentspending)
   - [Verify/Reject Payment (Admin)](#put-paymentspaymentidverify)
4. [Users](#users)
   - [List Users](#get-users)
   - [Get User by ID](#get-usersuserid)
   - [Update User](#put-usersuserid)
   - [Request Plan Change](#post-usersuseridplan-change-request)
   - [List Plan Change Requests](#get-usersplan-change-requestslist)
   - [Review Plan Change Request (Admin)](#put-usersplan-change-requestsrequestid)
5. [Dashboard](#dashboard)
   - [User Dashboard](#get-dashboarduser)
   - [Team Overview](#get-dashboardteam)
   - [Admin Analytics](#get-dashboardadmin)
6. [Common Patterns](#common-patterns)

---

## Health Check

### `GET /health`

> No auth required.

**Response `200`**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-19T17:38:47.402Z",
  "database": "connected"
}
```

---

## Authentication

### `POST /api/auth/login`

> No auth required. Rate-limited: 5 failed attempts → 15 min lockout per user ID.

**Request Body**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `uniqueUserId` | string | Yes | The user's unique identifier |
| `pin` | string | Yes | 4–8 digit PIN |

**Response `200`**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "name": "System Admin",
    "uniqueUserId": "admin",
    "role": "admin",
    "bankAccountNumber": "ECN00001001",
    "bankAccountStatus": "active"
  }
}
```

**Error Responses**
| Status | Reason |
|--------|--------|
| `401` | Invalid credentials (wrong ID or PIN) |
| `403` | Account is inactive |
| `429` | Too many failed attempts (locked out) |

---

### `POST /api/auth/register`

> **Admin only.**  Creates a new user and automatically opens a bank account.

**Request Body**
| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `name` | string | Yes | — | Full name |
| `uniqueUserId` | string | Yes | — | 3–50 chars, must be unique |
| `pin` | string | Yes | — | 4–8 chars |
| `role` | string | No | `"member"` | `"admin"` or `"member"` |
| `planType` | string | No | `"daily"` | `"daily"` or `"weekly"` |
| `targetAmount` | string(decimal) | No | `null` | e.g. `"12000.00"` |

**Response `201`**
```json
{
  "message": "User registered. Bank account created automatically.",
  "user": {
    "id": 2,
    "name": "Test User",
    "uniqueUserId": "testuser01",
    "role": "member",
    "planType": "daily",
    "balance": "0.00"
  },
  "bankAccount": {
    "accountNumber": "ECN00001001",
    "iban": "GB29NWBK60161ECN00001001",
    "sortCode": "00-00-00",
    "currency": "NGN",
    "status": "active"
  }
}
```

> If bank account creation fails, `bankAccount` will be:
> ```json
> { "status": "pending", "message": "Bank account provisioning in progress." }
> ```

**Error Responses**
| Status | Reason |
|--------|--------|
| `400` | Validation errors |
| `403` | Non-admin tried to register |
| `409` | `uniqueUserId` already exists |

---

### `GET /api/auth/profile`

> Returns the logged-in user's full profile including bank account details.

**Response `200`**
```json
{
  "user": {
    "id": 2,
    "name": "Test User",
    "uniqueUserId": "testuser01",
    "role": "member",
    "planType": "daily",
    "balance": "0.00",
    "targetAmount": "12000.00",
    "planStartDate": "2026-03-19T17:39:36.000Z"
  },
  "bankAccount": {
    "accountNumber": "ECN00001001",
    "iban": "GB29NWBK60161ECN00001001",
    "sortCode": "00-00-00",
    "currency": "NGN",
    "status": "active",
    "openedAt": "2026-03-19T17:39:36.000Z"
  }
}
```

---

### `PUT /api/auth/change-pin`

> Change the currently logged-in user's PIN.

**Request Body**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `currentPin` | string | Yes | Existing PIN |
| `newPin` | string | Yes | 4–8 chars |

**Response `200`**
```json
{ "message": "PIN changed successfully" }
```

**Error Responses**
| Status | Reason |
|--------|--------|
| `401` | Current PIN is incorrect |

---

## Payments

### `GET /api/payments/preview`

> Preview how a payment amount would be allocated across contribution slots **before** submitting. Use this to show the user what their deposit covers.

**Query Parameters**
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `amount` | number | Yes | Must be > 0 |

**Response `200`**
```json
{
  "preview": {
    "totalAmount": 5000,
    "ratePerPeriod": 100,
    "planType": "daily",
    "slots": [
      {
        "date": "2025-02-15",
        "periodNumber": 6,
        "slotType": "past",
        "required": 100,
        "alreadyPaid": 0,
        "covered": 100,
        "totalPaid": 100,
        "fullyCovered": true,
        "partiallyCovered": false
      }
    ],
    "periodsFullyCovered": 50,
    "missedPeriodsCovered": 30,
    "futurePeriodsCovered": 15,
    "currentPeriodCovered": 1,
    "remainderUnallocated": 0,
    "summary": "This payment covers 30 missed days, today's contribution, 15 upcoming days."
  }
}
```

---

### `GET /api/payments/calendar`

> Returns the full contribution calendar — every slot with its payment status. Drives the calendar UI with ticks.

**Query Parameters**
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `userId` | number | No | Admin only — view another user's calendar |

**Response `200`**
```json
{
  "calendar": [
    {
      "periodNumber": 1,
      "date": "2025-02-10",
      "status": "paid",
      "paidAmount": 100,
      "required": 100,
      "deficit": 0
    },
    {
      "periodNumber": 2,
      "date": "2025-02-11",
      "status": "missed",
      "paidAmount": 0,
      "required": 100,
      "deficit": 100
    },
    {
      "periodNumber": 3,
      "date": "2025-02-12",
      "status": "partial",
      "paidAmount": 50,
      "required": 100,
      "deficit": 50
    },
    {
      "periodNumber": 120,
      "date": "2025-06-09",
      "status": "upcoming",
      "paidAmount": 0,
      "required": 100,
      "deficit": 100
    }
  ],
  "planType": "daily",
  "ratePerPeriod": 100
}
```

**Calendar slot `status` values:**
| Status | Meaning |
|--------|---------|
| `paid` | Fully covered (tick ✓) |
| `partial` | Partially paid |
| `missed` | Past slot, not paid |
| `current` | Today's slot, not yet paid |
| `upcoming` | Future slot |

---

### `POST /api/payments/submit`

> Submit a payment. Goes to `pending` status until admin verifies.

**Request Body**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `amount` | string(decimal) | Yes | Must be > 0, up to 2 decimal places |
| `paymentMethod` | string | No | Max 50 chars (e.g. `"bank_transfer"`, `"cash"`) |
| `idempotencyKey` | string | Yes | Unique per payment — prevents duplicates. Generate a UUID on the frontend. |

**Response `201`**
```json
{
  "message": "Payment submitted and pending verification.",
  "payment": {
    "paymentId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "amount": "5000",
    "status": "pending"
  },
  "allocationPreview": {
    "summary": "This payment covers 30 missed days, today's contribution, 15 upcoming days.",
    "periodsFullyCovered": 50,
    "missedPeriodsCovered": 30,
    "futurePeriodsCovered": 15,
    "slots": [ "..." ]
  }
}
```

> If the same `idempotencyKey` is sent again, returns `200` with the existing payment instead of creating a duplicate.

---

### `GET /api/payments/history`

> Get the logged-in user's payment history.

**Query Parameters**
| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `status` | string | — | Filter: `"pending"`, `"verified"`, or `"rejected"` |
| `limit` | number | `50` | Page size |
| `offset` | number | `0` | Pagination offset |

**Response `200`**
```json
{
  "payments": [
    {
      "payment_id": "a1b2c3d4-...",
      "amount": "5000.00",
      "payment_date": "2026-03-19T10:00:00.000Z",
      "status": "verified",
      "payment_method": "bank_transfer",
      "verification_notes": "Confirmed via bank statement",
      "verified_at": "2026-03-19T12:00:00.000Z",
      "allocation_summary": "This payment covers 50 days.",
      "covered_periods": [ { "periodNumber": 1, "date": "2025-02-10", "covered": 100, "fullyCovered": true } ],
      "verified_by_name": "System Admin"
    }
  ],
  "total": 15,
  "limit": 50,
  "offset": 0
}
```

---

### `GET /api/payments/:paymentId`

> Get details for a single payment. Members can only view their own; admins can view any.

**Response `200`**
```json
{
  "payment": {
    "payment_id": "a1b2c3d4-...",
    "user_id": 2,
    "amount": "5000.00",
    "payment_date": "2026-03-19T10:00:00.000Z",
    "status": "verified",
    "payment_method": "bank_transfer",
    "verification_notes": "OK",
    "verified_by": 1,
    "verified_at": "2026-03-19T12:00:00.000Z",
    "idempotency_key": "frontend-uuid-here",
    "allocation_summary": "...",
    "covered_periods": [],
    "user_name": "Test User",
    "unique_user_id": "testuser01",
    "verified_by_name": "System Admin"
  }
}
```

---

### `GET /api/payments/pending`

> **Admin only.** List all payments awaiting verification.

**Response `200`**
```json
{
  "payments": [
    {
      "payment_id": "a1b2c3d4-...",
      "amount": "5000.00",
      "payment_date": "2026-03-19T10:00:00.000Z",
      "payment_method": "cash",
      "allocation_summary": "This payment covers 50 days.",
      "user_id": 2,
      "user_name": "Test User",
      "unique_user_id": "testuser01",
      "bank_account_number": "ECN00001001",
      "hours_pending": 3.5
    }
  ]
}
```

---

### `PUT /api/payments/:paymentId/verify`

> **Admin only.** Verify or reject a pending payment. On verification, the allocation is persisted and the user's balance is updated.

**Request Body**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `status` | string | Yes | `"verified"` or `"rejected"` |
| `notes` | string | No | Optional admin notes |

**Response `200`**
```json
{
  "message": "Payment verified successfully.",
  "paymentId": "a1b2c3d4-..."
}
```

**Error Responses**
| Status | Reason |
|--------|--------|
| `404` | Payment not found or already processed |

---

## Users

### `GET /api/users`

> List users. Supports search and filtering.

**Query Parameters**
| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `search` | string | — | Search by name or unique ID (case-insensitive) |
| `planType` | string | — | Filter: `"daily"` or `"weekly"` |
| `limit` | number | `50` | Page size |
| `offset` | number | `0` | Pagination offset |

**Response `200`**
```json
{
  "users": [
    {
      "id": 2,
      "name": "Test User",
      "unique_user_id": "testuser01",
      "role": "member",
      "plan_type": "daily",
      "balance": "5000.00",
      "target_amount": "12000.00",
      "plan_start_date": "2026-03-19T00:00:00.000Z",
      "is_active": true,
      "created_at": "2026-03-19T00:00:00.000Z"
    }
  ],
  "total": 10,
  "limit": 50,
  "offset": 0
}
```

---

### `GET /api/users/:userId`

> Get a single user by ID.

**Response `200`**
```json
{
  "user": {
    "id": 2,
    "name": "Test User",
    "unique_user_id": "testuser01",
    "role": "member",
    "plan_type": "daily",
    "balance": "5000.00",
    "target_amount": "12000.00",
    "plan_start_date": "2026-03-19T00:00:00.000Z",
    "is_active": true,
    "created_at": "2026-03-19T00:00:00.000Z"
  }
}
```

---

### `PUT /api/users/:userId`

> Update a user. Members can update their own `name` and `targetAmount`. Admins can also update `role` and `isActive`.

**Request Body** (all optional)
| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Non-empty |
| `targetAmount` | string(decimal) | e.g. `"15000.00"` |
| `isActive` | boolean | Admin only |
| `role` | string | Admin only — `"admin"` or `"member"` |

**Response `200`**
```json
{
  "message": "User updated successfully",
  "user": {
    "id": 2,
    "name": "Updated Name",
    "unique_user_id": "testuser01",
    "role": "member",
    "plan_type": "daily",
    "balance": "5000.00",
    "target_amount": "15000.00",
    "is_active": true,
    "updated_at": "2026-03-19T12:00:00.000Z"
  }
}
```

---

### `POST /api/users/:userId/plan-change-request`

> Request to switch plans (daily ↔ weekly). User can only request for themselves. Requires admin approval.

**Request Body**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `requestedPlan` | string | Yes | `"daily"` or `"weekly"` |
| `reason` | string | No | Why you want to switch |

**Response `201`**
```json
{
  "message": "Plan change request submitted successfully",
  "request": {
    "request_id": 1,
    "user_id": 2,
    "current_plan": "daily",
    "requested_plan": "weekly",
    "status": "pending",
    "created_at": "2026-03-19T12:00:00.000Z"
  }
}
```

**Error Responses**
| Status | Reason |
|--------|--------|
| `400` | Requested plan is same as current |
| `403` | Trying to request for another user |
| `409` | Already have a pending request |

---

### `GET /api/users/plan-change-requests/list`

> List plan change requests. Admins see all; members see only their own.

**Response `200`**
```json
{
  "requests": [
    {
      "request_id": 1,
      "user_id": 2,
      "current_plan": "daily",
      "requested_plan": "weekly",
      "status": "pending",
      "reason": "I prefer weekly bulk payments",
      "created_at": "2026-03-19T12:00:00.000Z",
      "reviewed_at": null,
      "user_name": "Test User",
      "unique_user_id": "testuser01",
      "reviewed_by_name": null
    }
  ]
}
```

---

### `PUT /api/users/plan-change-requests/:requestId`

> **Admin only.** Approve or reject a plan change request. If approved, the user's plan is updated immediately.

**Request Body**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `status` | string | Yes | `"approved"` or `"rejected"` |

**Response `200`**
```json
{
  "message": "Plan change request approved",
  "requestId": "1"
}
```

---

## Dashboard

### `GET /api/dashboard/user`

> Get the logged-in user's dashboard data — balance, campaign progress, payment stats.

**Response `200`**
```json
{
  "user": {
    "name": "Test User",
    "uniqueUserId": "testuser01",
    "balance": 5000,
    "targetAmount": 12000,
    "planType": "daily",
    "planStartDate": "2026-03-19T00:00:00.000Z"
  },
  "campaign": {
    "daysElapsed": 402,
    "daysRemaining": 0,
    "totalDays": 120,
    "startDate": "2025-02-10T00:00:00.000Z",
    "endDate": "2025-06-10T00:00:00.000Z"
  },
  "stats": {
    "verifiedPayments": 45,
    "pendingPayments": 1,
    "rejectedPayments": 0,
    "totalVerified": 5000,
    "expectedAmount": 12000,
    "progressPercentage": 41.67
  },
  "recentPayments": [
    {
      "payment_id": "a1b2c3d4-...",
      "amount": "100.00",
      "payment_date": "2026-03-19T10:00:00.000Z",
      "status": "verified"
    }
  ]
}
```

---

### `GET /api/dashboard/team`

> Team overview — all members with balances and stats. Visible to every logged-in user.

**Query Parameters**
| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `sortBy` | string | `"name"` | `"name"`, `"balance"`, or `"plan_type"` |
| `order` | string | `"ASC"` | `"ASC"` or `"DESC"` |
| `limit` | number | `50` | Page size |
| `offset` | number | `0` | Pagination offset |

**Response `200`**
```json
{
  "users": [
    {
      "id": 2,
      "name": "Test User",
      "uniqueUserId": "testuser01",
      "balance": 5000,
      "targetAmount": 12000,
      "planType": "daily",
      "paymentCount": 45,
      "pendingCount": 1,
      "progressPercentage": 41.67
    }
  ],
  "totals": {
    "totalBalance": 150000,
    "totalMembers": 25,
    "dailyPlanCount": 20,
    "weeklyPlanCount": 5
  },
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0
  }
}
```

---

### `GET /api/dashboard/admin`

> **Admin only.** Full analytics — payment distribution, trends, top contributors, attention alerts, plan stats.

**Response `200`**
```json
{
  "paymentStats": [
    { "status": "verified", "count": 200, "totalAmount": 500000 },
    { "status": "pending", "count": 5, "totalAmount": 2500 },
    { "status": "rejected", "count": 2, "totalAmount": 800 }
  ],
  "dailyTrends": [
    { "date": "2026-03-19", "paymentCount": 12, "totalAmount": 6000 },
    { "date": "2026-03-18", "paymentCount": 8, "totalAmount": 4000 }
  ],
  "topContributors": [
    { "name": "Star Saver", "uniqueUserId": "star01", "balance": 12000, "paymentCount": 120 }
  ],
  "attentionNeeded": [
    { "name": "Late User", "uniqueUserId": "late01", "pendingCount": 3, "oldestPending": "2026-03-17T08:00:00.000Z" }
  ],
  "planStats": [
    { "planType": "daily", "memberCount": 20, "avgBalance": 6000, "totalBalance": 120000 },
    { "planType": "weekly", "memberCount": 5, "avgBalance": 6000, "totalBalance": 30000 }
  ]
}
```

---

## Common Patterns

### Authentication

All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```
Token is obtained from `POST /api/auth/login` and expires in 24 hours.

### Roles

| Role | Capabilities |
|------|-------------|
| `member` | Login, view own profile/dashboard/calendar, submit payments, view payment history, request plan change, view team overview |
| `admin` | Everything above + register users, verify/reject payments, view all pending payments, review plan change requests, admin analytics, view any user's calendar |

### Error Format

All errors follow:
```json
{ "error": "Human-readable error message" }
```

Validation errors:
```json
{
  "errors": [
    { "type": "field", "msg": "Name is required", "path": "name", "location": "body" }
  ]
}
```

### Pagination

Paginated endpoints accept `limit` and `offset` query params and return:
```json
{
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

### Idempotency

Payment submission requires an `idempotencyKey` (generate a UUID v4 on the frontend). If the same key is sent twice, the server returns the existing payment instead of creating a duplicate.

### Currency

All monetary values are in **NGN** (Nigerian Naira) as strings with 2 decimal places (e.g. `"5000.00"`). Parse to numbers on the frontend as needed.

### Plans

| Plan | Rate | Frequency |
|------|------|-----------|
| `daily` | 100.00 | Every day |
| `weekly` | 700.00 | Every week |

### Campaign

The savings campaign is configured server-side:
- **Start:** `2025-02-10`
- **Duration:** `120 days`
- **End:** `2025-06-10`
