import path from "node:path";
import { applySqlFile, closeDatabase } from "./_shared";

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Укажите SQL-файл: npm run db:schema");
  }

  const absolutePath = path.resolve(filePath);
  await applySqlFile(absolutePath);
  console.log(`SQL применён: ${absolutePath}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
