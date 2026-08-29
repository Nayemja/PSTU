import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware";
import { history } from "./transaction.controller";

export const transactionRouter = Router();

transactionRouter.get("/history", requireAuth, history);
