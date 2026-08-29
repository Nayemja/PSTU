import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { searchUsers } from "./user.service";

export const userRouter = Router();

userRouter.get("/search", requireAuth, async (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
  if (!query) return void response.status(400).json({ success: false, message: "Search query is required" });

  try {
    response.json({ success: true, users: await searchUsers(request.userId!, query) });
  } catch {
    response.status(500).json({ success: false, message: "Internal server error" });
  }
});
