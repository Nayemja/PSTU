import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const requireAuth: RequestHandler = (request, response, next) => {
  const token = request.cookies.trustpay_token;

  if (!token) {
    response.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);

    if (typeof payload === "string" || typeof payload.userId !== "string") {
      throw new Error("Invalid token payload");
    }

    request.userId = payload.userId;
    next();
  } catch {
    response.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }
};
