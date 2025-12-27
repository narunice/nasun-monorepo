// src/components/ui/tag.tsx
import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/utils";
import { tagVariants } from "./tag-variants";

export interface TagProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tagVariants> {}

const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <span className={cn(tagVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Tag.displayName = "Tag";

export { Tag };
