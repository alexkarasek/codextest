import { getRunRepository } from "../lib/runRepository.js";

async function main() {
  const repo = getRunRepository();
  const result = await repo.migrateFromLegacyDebates({ limit: 10000 });
  console.log(JSON.stringify({ ok: true, imported: result.imported }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, code: error.code || "MIGRATION_ERROR" }, null, 2));
  process.exitCode = 1;
});
