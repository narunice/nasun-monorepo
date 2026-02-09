import { Slot } from "@radix-ui/react-slot";
import { type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils/utils";
import { buttonV3Variants } from "./button-v3-variants";

export interface ButtonV3Props
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonV3Variants> {
  asChild?: boolean;
}

const ButtonV3 = React.forwardRef<HTMLButtonElement, ButtonV3Props>(
  ({ className, variant, size, outline, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonV3Variants({ variant, size, outline }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
ButtonV3.displayName = "ButtonV3";

export { ButtonV3 };
