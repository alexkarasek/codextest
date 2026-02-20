import { sendError } from "./response.js";

export function sendMappedError(
  res,
  error,
  mappings = [],
  fallback = { status: 500, code: "SERVER_ERROR", message: "Request failed." }
) {
  const match = mappings.find((entry) => {
    if (!entry) return false;
    const matchCode = entry.matchCode || entry.code;
    return matchCode === error?.code;
  });
  if (match) {
    const message = typeof match.message === "function"
      ? match.message(error)
      : (typeof match.message === "string" ? match.message : (error?.message || "Request failed."));
    const details = typeof match.details === "function"
      ? match.details(error)
      : (typeof match.details !== "undefined" ? match.details : undefined);
    sendError(
      res,
      match.status || 500,
      match.responseCode || match.code || "SERVER_ERROR",
      message,
      details
    );
    return;
  }

  const fallbackMessage = typeof fallback.message === "function"
    ? fallback.message(error)
    : (fallback.message || error?.message || "Request failed.");
  sendError(
    res,
    fallback.status || 500,
    fallback.code || "SERVER_ERROR",
    fallbackMessage,
    typeof fallback.details === "function" ? fallback.details(error) : fallback.details
  );
}
