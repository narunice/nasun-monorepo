import { Slot } from "@radix-ui/react-slot";
import { type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils/utils";
import { buttonV4Variants } from "./button-v4-variants";

export interface ButtonV4Props
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">,
    VariantProps<typeof buttonV4Variants> {
  asChild?: boolean;
}

const ButtonV4 = React.forwardRef<HTMLButtonElement, ButtonV4Props>(
  ({ className, color, size, outline, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonV4Variants({ color, size, outline }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
ButtonV4.displayName = "ButtonV4";

export { ButtonV4 };
