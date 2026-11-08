import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import vendorRoutes from "./routes/vendorRoutes.js";
import { errorHandler, notFound } from "./middleware/errorMiddleware.js";

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = (
  process.env.CLIENT_URL || (isProduction ? "" : "http://localhost:5173")
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const rateLimitHandler = (req, res) =>
  res.status(429).json({
    success: false,
    message: "Too many requests. Please try again later.",
  });
const limiter = (windowMs, limit) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      process.env.NODE_ENV === "test" &&
      req.get("x-enable-rate-limit-test") !== "true",
    handler: rateLimitHandler,
  });

app.disable("x-powered-by");
app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));
app.use(helmet());
if (process.env.NODE_ENV !== "test")
  app.use(morgan(isProduction ? "combined" : "dev"));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin))
        return callback(null, true);
      const error = new Error("This origin is not allowed by CORS.");
      error.statusCode = 403;
      return callback(error);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(limiter(15 * 60 * 1000, Number(process.env.RATE_LIMIT_MAX) || 300));
app.use(cookieParser());
// CORS validates Origin above. Require it for production cookie mutations as
// SameSite=None may be needed when the UI and API use different hosts.
app.use((req, res, next) => {
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const cookieAuth =
    req.cookies?.eventifyy_access || req.cookies?.eventifyy_refresh;
  if (
    unsafe &&
    !req.get("origin") &&
    (req.get("sec-fetch-site") === "cross-site" ||
      (process.env.NODE_ENV === "production" &&
        cookieAuth &&
        !req.get("authorization")))
  )
    return res.status(403).json({
      success: false,
      message: "A trusted Origin is required for this request.",
    });
  return next();
});
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(["/api/auth", "/api/bookings", "/api/admin"], (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.get(["/", "/api/health"], (req, res) =>
  res.json({ success: true, message: "Planzo API is running." }),
);
const authLimiter = limiter(
  15 * 60 * 1000,
  Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
);
const recoveryLimiter = limiter(
  60 * 60 * 1000,
  Number(process.env.PASSWORD_RESET_REQUEST_MAX) || 3,
);
const confirmationLimiter = limiter(
  60 * 60 * 1000,
  Number(process.env.PASSWORD_RESET_ATTEMPT_MAX) || 10,
);
app.use(["/api/auth/login", "/api/auth/register"], authLimiter);
app.use(["/api/auth/login/otp/request"], recoveryLimiter);
app.use(["/api/auth/login/otp/verify"], confirmationLimiter);
app.use(
  ["/api/auth/forgot-password", "/api/auth/email-change"],
  recoveryLimiter,
);
app.use(
  ["/api/auth/reset-password", "/api/auth/email-change/confirm"],
  confirmationLimiter,
);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/bookings", bookingRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
