import type { RequestHandler, Response } from "express";

import {
  DuplicateEmailError,
  ExpiredOtpError,
  getCurrentUser,
  InvalidOtpError,
  loginUser,
  requestRegistrationOtp,
  verifyRegistrationOtp,
} from "./auth.service";
import { loginSchema, registerSchema, verifyOtpSchema } from "./auth.schema";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: false,
  maxAge: 24 * 60 * 60 * 1000,
};

function setAuthCookie(response: Response, token: string): void {
  response.cookie("trustpay_token", token, cookieOptions);
}

export const requestOtp: RequestHandler = async (request, response) => {
  const parsedInput = registerSchema.safeParse(request.body);

  if (!parsedInput.success) {
    response.status(400).json({
      success: false,
      message: "Invalid registration data",
    });
    return;
  }

  try {
    await requestRegistrationOtp(parsedInput.data);
    response.json({
      success: true,
      message: "OTP sent to your email",
    });
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      response.status(409).json({
        success: false,
        message: "Email is already registered",
      });
      return;
    }

    response.status(500).json({ success: false, message: "Could not send OTP" });
  }
};

export const verifyOtp: RequestHandler = async (request, response) => {
  const parsedInput = verifyOtpSchema.safeParse(request.body);

  if (!parsedInput.success) {
    response.status(400).json({ success: false, message: "Invalid OTP" });
    return;
  }

  try {
    const result = await verifyRegistrationOtp(parsedInput.data);
    setAuthCookie(response, result.token);
    response.status(201).json({
      success: true,
      message: "Account created",
      user: result.user,
      balancePoysha: result.balancePoysha,
    });
  } catch (error) {
    if (error instanceof ExpiredOtpError) {
      response.status(400).json({ success: false, message: "OTP expired" });
      return;
    }
    if (error instanceof InvalidOtpError) {
      response.status(400).json({ success: false, message: "Invalid OTP" });
      return;
    }
    if (error instanceof DuplicateEmailError) {
      response.status(409).json({ success: false, message: "Email is already registered" });
      return;
    }
    response.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const login: RequestHandler = async (request, response) => {
  const parsedInput = loginSchema.safeParse(request.body);

  if (!parsedInput.success) {
    response.status(400).json({
      success: false,
      message: "Invalid login data",
    });
    return;
  }

  try {
    const result = await loginUser(parsedInput.data);

    if (!result) {
      response.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    setAuthCookie(response, result.token);
    response.json({
      success: true,
      user: result.user,
      balancePoysha: result.balancePoysha,
    });
  } catch {
    response.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const me: RequestHandler = async (request, response) => {
  try {
    const result = await getCurrentUser(request.userId!);

    if (!result) {
      response.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    response.json({ success: true, ...result });
  } catch {
    response.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const logout: RequestHandler = (_request, response) => {
  response.clearCookie("trustpay_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });
  response.json({ success: true, message: "Logged out successfully" });
};
