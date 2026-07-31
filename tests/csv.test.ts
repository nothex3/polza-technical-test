import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, recordToObject } from "@/lib/csv";

test("parseCsv handles quoted commas and comma-only rows", () => {
  const parsed = parseCsv(
    'id,name,address\r\nc_1,"ООО ""Тест""","ул. Мира, д. 1"\r\n,,\r\n',
  );

  assert.deepEqual(parsed.headers, ["id", "name", "address"]);
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0]?.lineNumber, 2);
  assert.deepEqual(recordToObject(parsed.headers, parsed.records[0]), {
    id: "c_1",
    name: 'ООО "Тест"',
    address: "ул. Мира, д. 1",
  });
  assert.deepEqual(parsed.records[1]?.values, ["", "", ""]);
});
