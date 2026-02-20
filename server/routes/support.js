import express from "express";
import { answerSupportMessage } from "../../src/support/supportAgent.js";
import { sendError, sendOk } from "../response.js";
import { sendMappedError } from "../errorMapper.js";

const router = express.Router();

router.post("/messages", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) {
    sendError(res, 400, "VALIDATION_ERROR", "message is required.");
    return;
  }

  try {
    const data = await answerSupportMessage({
      message,
      user: req.auth?.user || null
    });
    sendOk(res, data);
  } catch (error) {
    sendMappedError(
      res,
      error,
      [{ code: "VALIDATION_ERROR", status: 400 }],
      {
        status: 500,
        code: "SERVER_ERROR",
        message: (e) => `Support response failed: ${e.message}`
      }
    );
  }
});

export default router;
