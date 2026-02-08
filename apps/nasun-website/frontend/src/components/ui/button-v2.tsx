// src/components/ui/button-v2.tsx
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils/utils";
import { buttonV2Variants } from "./button-v2-variants";

export interface ButtonV2Props
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonV2Variants> {
  asChild?: boolean;
}

const ButtonV2 = React.forwardRef<HTMLButtonElement, ButtonV2Props>(
  ({ className, variant, size, outline, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonV2Variants({ variant, size, outline }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
ButtonV2.displayName = "ButtonV2";

export { ButtonV2 };
