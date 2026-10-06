import { Router, type IRouter } from "express";
import agrishareRouter from "./agrishare";
import healthRouter from "./health";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agrishareRouter);
router.use(storageRouter);

export default router;
