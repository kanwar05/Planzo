import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/authRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import favoriteRoutes from "./routes/favoriteRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import vendorRoutes from "./routes/vendorRoutes.js";
import { errorHandler, notFound } from "./middleware/errorMiddleware.js";

const app = express();

const isProduction = process.env.NODE_ENV === "production";
const defaultClientUrl = isProduction ? "" : "http://localhost:5173";
const allowedOrigins = (process.env.CLIENT_URL || defaultClientUrl)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || "1mb";
const formBodyLimit = process.env.FORM_BODY_LIMIT || "1mb";

const rateLimitHandler = (req, res) => {
  res.status(429).json({
    success: false,
    message: "Too many requests. Please try again later.",
  });
};

const skipRateLimitInTests = (req) =>
  process.env.NODE_ENV === "test" &&
  req.get("x-enable-rate-limit-test") !== "true";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimitInTests,
  handler: rateLimitHandler,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimitInTests,
  handler: rateLimitHandler,
});

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(isProduction ? "combined" : "dev"));
}
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error("This origin is not allowed by CORS.");
      error.statusCode = 403;
      return callback(error);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(apiLimiter);
app.use(cookieParser());
app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: formBodyLimit }));

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Planzo API is running.",
  });
});
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Planzo API is running",
  });
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/reviews", reviewRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
