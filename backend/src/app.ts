import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { authRouter } from "./modules/auth/auth.routes";
import { moneyRequestRouter } from "./modules/moneyRequests/money-request.routes";
import { riskRouter } from "./modules/risk/risk.routes";
import { transactionRouter } from "./modules/transactions/transaction.routes";
import { transferRouter } from "./modules/transfers/transfer.routes";
import { userRouter } from "./modules/users/user.routes";

export const app = express();

app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);

app.use("/auth", authRouter);
app.use("/money-requests", moneyRequestRouter);
app.use("/risk", riskRouter);
app.use("/transfers", transferRouter);
app.use("/transactions", transactionRouter);
app.use("/users", userRouter);

app.get("/health", (_request, response) => {
  response.json({
    success: true,
    message: "TrustPay API is running",
  });
});
