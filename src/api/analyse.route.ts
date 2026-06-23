import { Router } from "express";
import multer, { MulterError } from "multer";
import { InvalidCsvError } from "../ingestion/csv.parser.js";
import { SchemaValidationError } from "../ingestion/row.validator.js";
import { AnalyseService } from "../service/analyse.service.js";

const FILE_SIZE_LIMIT = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_SIZE_LIMIT },
});

const analyseService = new AnalyseService();

export const analyseRouter = Router();

analyseRouter.post("/", (req, res) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "File too large" });
        return;
      }

      res.status(500).json({ error: "Unexpected internal error" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "Missing file field" });
      return;
    }

    try {
      const csvContent = req.file.buffer.toString("utf-8");
      const response = analyseService.analyse(csvContent);
      res.status(200).json(response);
    } catch (err) {
      const mapped = mapError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });
});

function mapError(error: unknown): { status: number; message: string } {
  if (error instanceof SchemaValidationError) {
    return { status: 400, message: error.message };
  }

  if (error instanceof InvalidCsvError) {
    const status = error.message.toLowerCase().includes("empty") ? 400 : 422;
    return { status, message: error.message };
  }

  return { status: 500, message: "Unexpected internal error" };
}
