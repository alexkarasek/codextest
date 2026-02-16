import express from "express";
import { z } from "zod";
import { discoverCurrentEventTopics } from "../../lib/newsProvider.js";
import { formatZodError } from "../../lib/validators.js";
import { sendError, sendOk } from "../response.js";

const router = express.Router();

const topicQuerySchema = z.object({
  query: z.string().min(2, "query must be at least 2 characters"),
  limit: z
    .preprocess((v) => {
      if (v === undefined || v === null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().int().min(1).max(20))
    .optional()
    .default(8),
  recencyDays: z
    .preprocess((v) => {
      if (v === undefined || v === null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().int().min(1).max(30))
    .optional()
    .default(7),
  provider: z.string().optional()
});

router.get("/current-events", async (req, res) => {
  const parsed = topicQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid topic query.", formatZodError(parsed.error));
    return;
  }

  try {
    const result = await discoverCurrentEventTopics(parsed.data);
    sendOk(res, {
      query: parsed.data.query,
      provider: result.provider,
      items: result.items
    });
  } catch (error) {
    sendError(res, 502, "TOPIC_DISCOVERY_FAILED", `Topic discovery failed: ${error.message}`);
  }
});

export default router;
