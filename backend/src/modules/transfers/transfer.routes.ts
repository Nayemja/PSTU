import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware";
import { createTransfer } from "./transfer.controller";

export const transferRouter = Router();

transferRouter.post("/", requireAuth, createTransfer);
