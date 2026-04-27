import * as React from "react"
import { cn } from "@/lib/utils"

const Tabs = ({ children, value, onValueChange }: { children: React.ReactNode; value?: string; onValueChange?: (v: string) => void }) => (
  <div className="tabs">{children}</div>
)
const TabsList = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("tabs-list flex gap-1", className)}>{children}</div>
)
const TabsTrigger = ({ children, value, className }: { children: React.ReactNode; value: string; className?: string }) => (
  <button className={cn("tab-trigger", className)}>{children}</button>
)
const TabsContent = ({ children, value, className }: { children: React.ReactNode; value: string; className?: string }) => (
  <div className={cn("tab-content", className)}>{children}</div>
)

export { Tabs, TabsList, TabsTrigger, TabsContent }