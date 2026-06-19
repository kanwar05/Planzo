# Planzo Backend

REST API for Planzo, an event-services marketplace built with Node.js,
Express, MongoDB, Mongoose, JWT, and bcryptjs.

## Setup

Requirements:

- Node.js 18 or newer
- A local MongoDB instance or MongoDB Atlas connection string

```bash
cd server
npm install
cp .env.example .env
```

Update `.env` with your MongoDB URI and a long, random `JWT_SECRET`, then run:

```bash
npm run dev
```

The API defaults to `http://localhost:5001`. Test it at:

```bash
curl http://localhost:5001/api/health
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | API port; defaults to `5001` |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign access tokens |
| `JWT_EXPIRES_IN` | Token lifetime; defaults to `7d` |
| `CLIENT_URL` | Allowed frontend origin; comma-separate multiple origins |

## Authentication

Protected routes require:

```text
Authorization: Bearer <token>
```

Public registration accepts `customer` and `vendor` roles. Admin accounts
should be provisioned directly by a trusted administrator.

## API routes

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Vendors

- `POST /api/vendors/profile` — vendor only
- `GET /api/vendors`
- `GET /api/vendors/:id`
- `PATCH /api/vendors/profile` — profile owner only
- `DELETE /api/vendors/profile` — profile owner only

Vendor listing supports `category`, `location`, `search`, `verified`, `page`,
`limit`, and `sort=price_asc|price_desc` query parameters.

### Bookings

- `POST /api/bookings` — customer only
- `GET /api/bookings/my-bookings` — customer only
- `GET /api/bookings/vendor-requests` — vendor only
- `PATCH /api/bookings/:id/status`

Customers can cancel their own bookings. Vendors can accept, reject, or
complete requests sent to their vendor profile. Invalid status transitions
are rejected.

## Example registration

```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Riya Sharma",
    "email": "riya@example.com",
    "phone": "+91 98765 43210",
    "password": "secret123",
    "role": "customer"
  }'
```
