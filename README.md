# PLANZO

Event services marketplace where customers discover and book vendors, vendors manage bookings and showcase their work, and admins moderate the platform.

PLANZO is split into two independent applications:

```text
Planzo/
├── frontend/   # React + Vite + Tailwind CSS
└── server/     # Node.js + Express + MongoDB
```

## Features

### Customer
- Browse and search vendors by category, location, and service type
- View vendor profiles with detailed info, ratings, availability, and portfolio
- Book services with date/time selection and availability checking
- Manage bookings with real-time status updates
- Leave reviews with star ratings, text, and up to 4 images
- Save favorite vendors and manage saved list
- Receive real-time notifications for booking updates

### Vendor
- Create and manage vendor profile with service details, pricing, and portfolio
- Set recurring business hours, holidays, blocked dates, and time slot duration
- Manage incoming booking requests (accept/reject/complete)
- View customer reviews and respond publicly
- Track bookings and manage availability
- Receive notifications for new bookings and reviews

### Admin
- Verify vendor profiles before they appear in search
- Flag inappropriate reviews with moderation reasons
- Suspend vendors when reports are substantiated
- View all bookings and filter by status
- Monitor reviews and reported vendors
- Dashboard with platform statistics

## Quick Start

### Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` by default.

### Start the backend

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

Backend runs at `http://localhost:5001` by default.

The frontend expects the API at `http://localhost:5001/api`. Override it with
`VITE_API_URL` in `frontend/.env` when needed.

## Key Features In Detail

### Notifications
- Real-time notification system across all user roles
- Customer notifications: booking status updates (accepted/rejected/completed), review replies
- Vendor notifications: new booking requests, reviews
- Admin notifications: reports and moderation tasks
- Mark notifications as read, delete, or clear all

### Bookings & Availability
- Smart availability system with recurring business hours, holidays, and blocked time slots
- Automatic conflict detection prevents double-booking
- Booking status flow: pending → accepted/rejected → completed
- Customers can only cancel pending/accepted bookings
- Vendors manage incoming requests with clear authorization

### Reviews & Ratings
- One review per completed booking per customer
- Up to 4 images per review (Cloudinary-backed)
- Star ratings (1-5) with text comments
- Automatic vendor rating recalculation on every review change
- Vendors can reply publicly to reviews
- Admins can flag reviews with moderation reasons

### Admin Moderation
- Review flagging with audit trail (status, flagged date, reason)
- Vendor suspension tracking (suspended status, suspension date)
- Report management: dismiss or suspend vendors
- Comprehensive admin dashboard with statistics

### Image Management
- All vendor images (profile, cover, portfolio) hosted on Cloudinary
- Review images with Cloudinary storage
- Automatic cleanup when deleting profiles or reviews
- Up to 8 portfolio images per vendor
- Secure image deletion from Cloudinary on profile removal

## Documentation

See [`server/README.md`](server/README.md) for:
- Environment variables setup
- Complete API routes reference
- Authorization rules by role
- Availability system details
- Cloudinary vendor image uploads
- Example curl requests
- Testing instructions
