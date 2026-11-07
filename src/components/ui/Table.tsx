export const Table = ({ columns, data }: { columns: { header: string; accessor: string }[], data: any[] }) => {
  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm text-left">
        <thead className="bg-muted/50 border-b text-muted-foreground font-medium">
          <tr>
            {columns.map((col) => (
              <th key={col.accessor} className="px-4 py-3">{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                No data available
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={i} className="hover:bg-muted/30 transition-colors">
                {columns.map((col) => (
                  <td key={col.accessor} className="px-4 py-3">
                    {row[col.accessor]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
