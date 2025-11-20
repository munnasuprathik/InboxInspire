import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-lg border-2 border-input/60 bg-background/80 backdrop-blur-sm px-3 py-1 text-base shadow-sm",
        "transition-all duration-200",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-muted-foreground/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring focus-visible:shadow-md focus-visible:shadow-ring/10",
        "hover:border-input/80 hover:shadow-sm",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "md:text-sm min-h-[44px] sm:min-h-[36px] touch-manipulation",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
