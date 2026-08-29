import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware";
import { login, logout, me, requestOtp, verifyOtp } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/register/request-otp", requestOtp);
authRouter.post("/register/verify-otp", verifyOtp);
authRouter.post("/login", login);
authRouter.get("/me", requireAuth, me);
authRouter.post("/logout", logout);
