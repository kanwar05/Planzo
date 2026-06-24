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

Vendor image uploads are sent directly from the API to Cloudinary. Keep all
Cloudinary credentials in `server/.env`; only committed placeholders belong in
`.env.example`.

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
