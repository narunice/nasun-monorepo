import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/utils";
import { tagV2Variants } from "./tag-v2-variants";

export interface TagV2Props
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tagV2Variants> {}

const TagV2 = React.forwardRef<HTMLSpanElement, TagV2Props>(
  ({ className, variant, size, ...props }, ref) => {
    return <span className={cn(tagV2Variants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
TagV2.displayName = "TagV2";

export { TagV2 };
