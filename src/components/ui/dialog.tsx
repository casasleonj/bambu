import * as React from "react"
import { cn } from "@/lib/utils"

const Dialog = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
const DialogTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => (
    <button ref={ref} className={cn("btn", className)} {...props} />
  )
)
DialogTrigger.displayName = "DialogTrigger"
const DialogContent = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("dialog-content", className)}>{children}</div>
)

export { Dialog, DialogTrigger, DialogContent }