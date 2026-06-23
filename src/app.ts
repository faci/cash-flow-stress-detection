import express from "express";
import { analyseRouter } from "./api/analyse.route.js";

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());
  app.use("/analyse", analyseRouter);

  return app;
}
