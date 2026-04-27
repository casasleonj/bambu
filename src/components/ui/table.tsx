import * as React from "react"
import { cn } from "@/lib/utils"

const Table = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("relative w-full overflow-auto", className)}>
    <table className="w-full caption-bottom text-sm">{children}</table>
  </div>
)
const TableHeader = ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>
const TableBody = ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>
const TableRow = ({ children }: { children: React.ReactNode }) => <tr className="border-b transition-colors hover:bg-muted/50">{children}</tr>
const TableHead = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <th className={cn("h-12 px-4 text-left align-middle font-medium", className)}>{children}</th>
)
const TableCell = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <td className={cn("p-4 align-middle", className)}>{children}</td>
)

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }