import * as React from "react"
import { cn } from "@/lib/utils"

const Badge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "secondary" | "destructive" | "outline" }>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants = {
      default: "bg-emerald-600 text-white",
      secondary: "bg-slate-100 text-slate-900",
      destructive: "bg-red-600 text-white",
      outline: "text-foreground",
    }
    return (
      <div
        ref={ref}
        className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", variants[variant], className)}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge }