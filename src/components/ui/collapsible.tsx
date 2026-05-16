'use client'

import * as React from "react"

const CollapsibleContext = React.createContext<{
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}>({ open: false, setOpen: () => {} })

function Collapsible({ 
  children, 
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className 
}: { 
  children: React.ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string 
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = React.useCallback((value: React.SetStateAction<boolean>) => {
    const newValue = typeof value === 'function' ? value(open) : value
    if (!isControlled) setInternalOpen(newValue)
    onOpenChange?.(newValue)
  }, [isControlled, open, onOpenChange])

  return (
    <CollapsibleContext.Provider value={{ open, setOpen }}>
      <div className={className}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  )
}

function CollapsibleTrigger({ 
  children, 
  className
}: { 
  children: React.ReactNode
  className?: string
}) {
  const { open, setOpen } = React.useContext(CollapsibleContext)
  
  const handleClick = () => setOpen(!open)

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-expanded={open}
      className={className}
    >
      {children}
    </button>
  )
}

function CollapsibleContent({ 
  children, 
  className 
}: { 
  children: React.ReactNode
  className?: string 
}) {
  const { open } = React.useContext(CollapsibleContext)
  
  if (!open) return null
  
  return (
    <div className={className}>
      {children}
    </div>
  )
}

function useCollapsible() {
  return React.useContext(CollapsibleContext)
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent, useCollapsible }
