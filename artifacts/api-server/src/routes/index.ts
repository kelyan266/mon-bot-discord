import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botRouter from "./bot";
import casinoRouter from "./casino";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(casinoRouter);

export default router;
