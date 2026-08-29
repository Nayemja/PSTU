import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { approve, create, decline, list } from "./money-request.controller";

export const moneyRequestRouter = Router();
moneyRequestRouter.use(requireAuth);
moneyRequestRouter.post("/", create);
moneyRequestRouter.get("/", list);
moneyRequestRouter.post("/:id/approve", approve);
moneyRequestRouter.post("/:id/decline", decline);
