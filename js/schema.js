// @ts-check
// Columns added in later versions must appear in older database files too. Given the tables'
// column lists ({ table: { cols: [[name, type, doc]] } }) and the columns a file already has
// ({ table: Set<name> }), the ALTER statements that add what is missing: usually none, instead
// of one ALTER ... IF NOT EXISTS round trip per column at every start.
export function missingColumnStatements(tables, have) {
  const out = [];
  for (const [table, { cols }] of Object.entries(tables)) {
    const has = have[table] || new Set();
    for (const [name, type] of cols) {
      if (!type.includes('KEY') && !has.has(name)) out.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${type}`);
    }
  }
  return out;
}
