import { FileRunRepository } from "../packages/core/repositories/file/runRepository.js";

let singleton = null;

export function getRunRepository() {
  if (!singleton) singleton = new FileRunRepository();
  return singleton;
}
