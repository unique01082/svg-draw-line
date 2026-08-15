import apiReflection from "../../content/0.1/api-reflection.json";

interface ApiEntry {
  readonly name: string;
  readonly kind: string;
  readonly entry: "core" | "react";
}

export function ApiTable({
  entry,
}: {
  readonly entry: "core" | "react" | "all";
}) {
  const rows = (apiReflection.exports as ApiEntry[]).filter(
    (item) => entry === "all" || item.entry === entry,
  );
  return (
    <div className="api-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Export</th>
            <th>Kind</th>
            <th>Entry</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.entry}-${row.name}`}>
              <td>
                <code>{row.name}</code>
              </td>
              <td>{row.kind}</td>
              <td>{row.entry === "core" ? "root" : "/react"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
