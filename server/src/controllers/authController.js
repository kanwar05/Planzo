import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import generateToken from "../utils/generateToken.js";
import {
  requireFields,
  validateEmail,
} from "../utils/validation.js";

function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export const register = asyncHandler(async (req, res) => {
  requireFields(req.body, ["name", "email", "phone", "password"]);

  const name = String(req.body.name).trim();
  const email = String(req.body.email).trim().toLowerCase();
  const phone = String(req.body.phone).trim();
  const password = String(req.body.password);
  const role = req.body.role || "customer";

  validateEmail(email);

  if (!["customer", "vendor"].includes(role)) {
    throw new ApiError(
      400,
      "Public registration supports customer or vendor accounts only.",
    );
  }

  if (password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters.");
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const user = await User.create({ name, email, phone, password, role });

  res.status(201).json({
    success: true,
    message: "Account created successfully.",
    token: generateToken(user._id),
    user: serializeUser(user),
  });
});

export const login = asyncHandler(async (req, res) => {
  requireFields(req.body, ["email", "password"]);

  const email = String(req.body.email).trim().toLowerCase();
  validateEmail(email);

  const user = await User.findOne({ email }).select("+password");
  const passwordMatches =
    user && (await user.comparePassword(String(req.body.password)));

  if (!user || !passwordMatches) {
    throw new ApiError(401, "Invalid email or password.");
  }

  res.status(200).json({
    success: true,
    message: "Logged in successfully.",
    token: generateToken(user._id),
    user: serializeUser(user),
  });
});

export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    user: serializeUser(req.user),
  });
});
