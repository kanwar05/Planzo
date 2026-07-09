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
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret; never expose it in the frontend |
| `SMTP_HOST` | SMTP server host for transactional email |
| `SMTP_PORT` | SMTP server port; defaults to 587 |
| `SMTP_USER` | SMTP username, if your provider requires auth |
| `SMTP_PASS` | SMTP password, if your provider requires auth |
| `SMTP_FROM` | Sender address used for email notifications |
| `TWILIO_ACCOUNT_SID` | Twilio account SID for transactional SMS |
| `TWILIO_AUTH_TOKEN` | Twilio auth token for transactional SMS |
| `TWILIO_PHONE_NUMBER` | Verified Twilio phone number used as the SMS sender |
| `BOOKING_REMINDER_HOURS` | How long before a booking to send the reminder; defaults to 24 |
| `ENABLE_EMAIL` | Set to `false` to disable email delivery |
| `ENABLE_SMS` | Set to `true` to enable SMS delivery |
| `NOTIFICATION_JOB_INTERVAL_MS` | How often reminder jobs run in the background; defaults to 1 hour |

Legacy aliases `SMTP_SECURE`, `TWILIO_FROM_NUMBER`, `BOOKING_REMINDER_LEAD_MS`, and `REVIEW_REMINDER_DELAY_MS` remain supported for existing deployments.

Vendor image uploads are sent directly from the API to Cloudinary. Keep all
Cloudinary credentials in `server/.env`; only committed placeholders belong in
`.env.example`.

Transactional email and SMS are also optional but recommended. If SMTP or
Twilio is not configured, the API keeps working and skips those delivery
channels.

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
- `GET /api/vendors/me` — current vendor's profile
- `GET /api/vendors`
- `GET /api/vendors/:id`
- `GET /api/vendors/:id/availability`
- `GET /api/vendors/:vendorId/reviews`
- `POST /api/vendors/availability` — vendor only
- `PUT /api/vendors/availability` — vendor only
- `DELETE /api/vendors/availability` — vendor only
- `PATCH /api/vendors/profile` — profile owner only
- `DELETE /api/vendors/profile` — profile owner only
- `POST /api/vendors/images` — upload any combination of vendor images
- `PUT /api/vendors/profile-image` — replace the profile image
- `DELETE /api/vendors/profile-image` — delete the profile image
- `PUT /api/vendors/cover-image` — replace the cover image
- `DELETE /api/vendors/cover-image` — delete the cover image
- `POST /api/vendors/portfolio` — add portfolio images
- `DELETE /api/vendors/portfolio` — delete one portfolio image

Vendor listing supports `category`, `location`, `search`, `verified`, `page`,
`limit`, and `sort=price_asc|price_desc` query parameters.

The availability routes are also exposed at `/api/vendor/...` for clients that
prefer the singular route shape, for example `GET /api/vendor/:id/availability`.

### Vendor availability

Vendor availability supports recurring weekly business hours, blocked full
dates, holiday dates, blocked time slots, vacations, timezone, and slot
duration. Customers can read public availability for a vendor; only the vendor
who owns the profile can create, update, or delete their settings.

Fetch availability and generated slots for a date:

```bash
curl "http://localhost:5001/api/vendors/<vendor-id>/availability?date=2026-08-20"
```

Create or replace availability settings:

```bash
curl -X PUT http://localhost:5001/api/vendors/availability \
  -H "Authorization: Bearer <vendor-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "timezone": "Asia/Kolkata",
    "slotDurationMinutes": 60,
    "businessHours": [
      { "dayOfWeek": 1, "isOpen": true, "startTime": "10:00", "endTime": "18:00" }
    ],
    "blockedDates": [
      { "date": "2026-08-15", "type": "holiday", "reason": "Holiday" }
    ],
    "blockedTimeSlots": [
      { "date": "2026-08-20", "startTime": "13:00", "endTime": "14:00" }
    ],
    "vacations": [
      { "startDate": "2026-09-01", "endDate": "2026-09-05", "reason": "Vacation" }
    ]
  }'
```

Delete one availability item:

```bash
curl -X DELETE http://localhost:5001/api/vendors/availability \
  -H "Authorization: Bearer <vendor-token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"blockedTimeSlot","id":"<item-id>"}'
```

All image mutation routes require a vendor JWT:

```text
Authorization: Bearer <vendor-token>
Content-Type: multipart/form-data
```

Only JPEG, PNG, and WEBP files are accepted. Each image can be at most 5 MB,
and a vendor can store at most eight portfolio images. Cloudinary's secure URL
and public ID are stored in MongoDB as:

```json
{
  "url": "https://res.cloudinary.com/.../image/upload/...",
  "publicId": "planzo/vendors/portfolio/example"
}
```

The combined upload endpoint accepts these multipart fields:

| Field | Maximum |
| --- | ---: |
| `profileImage` | 1 |
| `coverImage` | 1 |
| `portfolioImages` | 8 |

```bash
curl -X POST http://localhost:5001/api/vendors/images \
  -H "Authorization: Bearer <vendor-token>" \
  -F "profileImage=@./profile.jpg" \
  -F "coverImage=@./cover.webp" \
  -F "portfolioImages=@./event-1.jpg" \
  -F "portfolioImages=@./event-2.jpg"
```

Uploading a new profile or cover image replaces the database reference and
removes the previous asset from Cloudinary. The dedicated portfolio endpoint
is retained for the existing frontend and accepts files using the `images`
field:

```bash
curl -X POST http://localhost:5001/api/vendors/portfolio \
  -H "Authorization: Bearer <vendor-token>" \
  -F "images=@./event-1.jpg" \
  -F "images=@./event-2.jpg"
```

Delete a portfolio image using its Cloudinary public ID (preferred) or URL:

```bash
curl -X DELETE http://localhost:5001/api/vendors/portfolio \
  -H "Authorization: Bearer <vendor-token>" \
  -H "Content-Type: application/json" \
  -d '{"publicId":"planzo/vendors/portfolio/example"}'
```

Deleting a vendor profile also removes its profile, cover, and portfolio
assets from Cloudinary. If cleanup fails, the profile is kept and the API
returns a clear `502` response instead of silently orphaning assets.

### Bookings

- `POST /api/bookings` — customer only
- `GET /api/bookings/my-bookings` — customer only
- `GET /api/bookings/vendor-requests` — vendor only
- `PATCH /api/bookings/:id/status`
- `GET /api/bookings/:bookingId/review` — booking customer, vendor, or admin

Customers can cancel their own bookings. Vendors can accept, reject, or
complete requests sent to their vendor profile. Invalid status transitions
are rejected.

New booking requests must include `eventStartTime` and `eventEndTime` in
`HH:mm` format. The API rejects unavailable dates, blocked slots, vacation
dates, times outside business hours, and overlapping active bookings.

### Reviews and ratings

- `POST /api/reviews` — customer only
- `GET /api/vendors/:vendorId/reviews` — public
- `GET /api/bookings/:bookingId/review` — booking participant or admin
- `PATCH /api/reviews/:id` — review owner only
- `DELETE /api/reviews/:id` — review owner only
- `PATCH /api/reviews/:id/reply` — reviewed vendor only

Customers can create one review per completed booking. The API verifies the
booking owner and vendor, so ratings cannot be posted directly against an
unrelated vendor. Ratings are whole numbers from 1 through 5. Comments are
required and may contain up to 2,000 characters.

Create a text-only review:

```bash
curl -X POST http://localhost:5001/api/reviews \
  -H "Authorization: Bearer <customer-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingId": "<completed-booking-id>",
    "rating": 5,
    "comment": "Excellent service and communication."
  }'
```

To attach up to four optional JPEG, PNG, or WEBP images, send multipart data.
Each image can be at most 5 MB:

```bash
curl -X POST http://localhost:5001/api/reviews \
  -H "Authorization: Bearer <customer-token>" \
  -F "bookingId=<completed-booking-id>" \
  -F "rating=5" \
  -F "comment=Excellent service and communication." \
  -F "images=@./review-1.jpg"
```

Review image objects store Cloudinary `url` and `publicId` values. Removed
images are deleted from Cloudinary. On every review create, rating update, or
delete, the API recalculates the vendor's `averageRating` and `reviewCount`
from review records; clients cannot set those fields.

Vendors can publish or update their response:

```bash
curl -X PATCH http://localhost:5001/api/reviews/<review-id>/reply \
  -H "Authorization: Bearer <vendor-token>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Thank you for choosing us."}'
```

### Favorites / saved vendors

- `POST /api/favorites/:vendorId` — customer only
- `DELETE /api/favorites/:vendorId` — customer only
- `GET /api/favorites` — customer only
- `GET /api/favorites/check/:vendorId` — customer only

All favorites routes require a customer JWT:

```text
Authorization: Bearer <customer-token>
```

Customers can save a vendor once, remove saved vendors, fetch their own saved
vendor list, and check whether a specific vendor is saved. Vendors cannot use
these endpoints. Invalid vendor IDs return `400`, missing vendors return `404`,
and duplicate saves return `409`.

Save a vendor:

```bash
curl -X POST http://localhost:5001/api/favorites/<vendor-id> \
  -H "Authorization: Bearer <customer-token>"
```

Check saved state:

```bash
curl http://localhost:5001/api/favorites/check/<vendor-id> \
  -H "Authorization: Bearer <customer-token>"
```

Response:

```json
{
  "isFavorited": true
}
```

Fetch saved vendors:

```bash
curl http://localhost:5001/api/favorites \
  -H "Authorization: Bearer <customer-token>"
```

Response:

```json
{
  "success": true,
  "count": 1,
  "favorites": [
    {
      "_id": "favorite-id",
      "createdAt": "2026-06-24T10:00:00.000Z",
      "vendorId": {
        "_id": "vendor-id",
        "businessName": "Celebration Studio",
        "serviceCategory": "Decoration",
        "category": "Decoration",
        "location": "Delhi",
        "pricing": 50000,
        "startingPrice": 50000,
        "rating": 4.8,
        "averageRating": 4.8,
        "reviewCount": 12,
        "profileImage": {
          "url": "https://res.cloudinary.com/.../image/upload/...",
          "publicId": "planzo/vendors/profile/example"
        }
      }
    }
  ]
}
```

Remove a saved vendor:

```bash
curl -X DELETE http://localhost:5001/api/favorites/<vendor-id> \
  -H "Authorization: Bearer <customer-token>"
```

Favorites are stored with indexes on `customerId`, `vendorId`, and a unique
compound index on `{ customerId, vendorId }`. Fetching favorites uses one
populated query to avoid N+1 lookups. Deleting a vendor profile also removes
related favorites.

## Tests

```bash
cd server
npm test

cd ../frontend
npm test
```

The backend integration test uses an isolated in-memory MongoDB instance and
does not write to the configured development database.

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
