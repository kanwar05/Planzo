import jwt from "jsonwebtoken";
import User from "../models/User.js";

const createToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

export async function register(req, res, next) {
  try {
    const { name, email, phone, password, role = "customer" } = req.body;

    if (await User.findOne({ email })) {
      res.status(409);
      throw new Error("An account with this email already exists.");
    }

    const user = await User.create({ name, email, phone, password, role });
    res.status(201).json({
      success: true,
      token: createToken(user._id),
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      res.status(401);
      throw new Error("Invalid email or password.");
    }

    res.json({
      success: true,
      token: createToken(user._id),
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    next(error);
  }
}

