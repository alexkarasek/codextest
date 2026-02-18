import express from "express";
import { answerSupportMessage } from "../../src/support/supportAgent.js";
import { sendError, sendOk } from "../response.js";

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
    if (error.code === "VALIDATION_ERROR") {
      sendError(res, 400, "VALIDATION_ERROR", error.message);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", `Support response failed: ${error.message}`);
  }
});

export default router;
