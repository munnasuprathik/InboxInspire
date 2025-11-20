import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-manipulation min-h-[44px] sm:min-h-0 relative overflow-hidden group",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.01] active:scale-[0.99] active:bg-primary/95",
        destructive:
          "bg-gradient-to-r from-destructive to-destructive/90 text-destructive-foreground shadow-lg shadow-destructive/25 hover:shadow-xl hover:shadow-destructive/30 hover:scale-[1.01] active:scale-[0.99]",
        outline:
          "border-2 border-input/60 bg-background/50 backdrop-blur-sm shadow-sm hover:bg-accent/50 hover:border-primary/40 hover:shadow-md hover:scale-[1.01] active:scale-[0.99]",
        secondary:
          "bg-gradient-to-r from-secondary to-secondary/90 text-secondary-foreground shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]",
        ghost: "hover:bg-accent/50 hover:text-accent-foreground active:bg-accent/70 hover:scale-[1.01] active:scale-[0.99]",
        link: "text-primary underline-offset-4 hover:underline active:text-primary/80",
      },
      size: {
        default: "h-9 sm:h-9 px-4 py-2 min-h-[44px] sm:min-h-[36px]",
        sm: "h-8 sm:h-8 rounded-md px-3 text-xs min-h-[44px] sm:min-h-[32px]",
        lg: "h-10 sm:h-10 rounded-md px-8 min-h-[44px] sm:min-h-[40px]",
        icon: "h-9 w-9 sm:h-9 sm:w-9 min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
