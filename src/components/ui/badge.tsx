import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-blue-200 bg-blue-50 text-blue-700",
        secondary:
          "border-gray-200 bg-gray-100 text-gray-600",
        destructive:
          "border-red-200 bg-red-50 text-red-700",
        outline:
          "border-gray-300 text-gray-600 bg-transparent",
        success:
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        warning:
          "border-amber-200 bg-amber-50 text-amber-700",
        info:
          "border-sky-200 bg-sky-50 text-sky-700",
        ghost:
          "border-gray-200 bg-gray-50 text-gray-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
