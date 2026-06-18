import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function protect(req, res, next) {
  try {
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null;

    if (!token) {
      res.status(401);
      throw new Error("Authentication required.");
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(payload.id).select("-password");

    if (!req.user) {
      res.status(401);
      throw new Error("User no longer exists.");
    }

    next();
  } catch (error) {
    if (res.statusCode === 200) res.status(401);
    next(error);
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      res.status(403);
      return next(new Error("You are not allowed to perform this action."));
    }
    next();
  };
}

