import type { TableData } from "../lib/types";

interface SheetTableProps {
  title: string;
  data: TableData;
}

export function SheetTable({ title, data }: SheetTableProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <h2 className="px-4 py-3 bg-gray-50 font-semibold text-gray-800 border-b border-gray-200">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              {data.headers.map((header, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, ri) => (
              <tr
                key={ri}
                className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-1.5 text-gray-700 whitespace-nowrap"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
