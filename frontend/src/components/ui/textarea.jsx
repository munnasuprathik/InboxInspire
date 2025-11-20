import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex w-full rounded-lg border-2 border-input/60 bg-background/80 backdrop-blur-sm px-3 py-2 text-base shadow-sm",
        "transition-all duration-200",
        "placeholder:text-muted-foreground/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring focus-visible:shadow-md focus-visible:shadow-ring/10",
        "hover:border-input/80 hover:shadow-sm",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "md:text-sm min-h-[44px] sm:min-h-[60px] touch-manipulation",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
