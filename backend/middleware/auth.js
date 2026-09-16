const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { fail } = require("../utils/response");

const extractUser = async (req) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.active === false) return null;
    return user;
  } catch (err) {
    return null;
  }
};

const protect = async (req, res, next) => {
  req.user = await extractUser(req);
  if (!req.user) {
    return fail(res, "Not authorized", 401);
  }
  next();
};

const protectOptional = async (req, res, next) => {
  req.user = await extractUser(req);
  next();
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return fail(res, "Forbidden: insufficient role", 403);
  }
  next();
};

module.exports = { protect, protectOptional, authorize, extractUser };
