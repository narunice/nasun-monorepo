/**
 * ButtonVariantRow - Reusable component for rendering a row of button sizes
 */
import { Button } from "../../ui/button";
import {
  type ButtonVariantConfig,
  type ButtonSize,
  BUTTON_SIZES,
  SIZE_LABELS,
} from "./buttonShowcaseData";

interface ButtonVariantRowProps {
  config: ButtonVariantConfig;
  disabled?: boolean;
}

export default function ButtonVariantRow({ config, disabled = false }: ButtonVariantRowProps) {
  const { name, variant, titleColor, customLabels } = config;

  const getLabel = (size: ButtonSize, index: number): string => {
    if (customLabels) {
      return customLabels[index] || SIZE_LABELS[size];
    }
    return SIZE_LABELS[size];
  };

  return (
    <div className="space-y-3">
      <h4 className={`text-lg font-medium ${titleColor || ""}`}>{name}</h4>
      <div className="flex flex-wrap gap-3 items-center">
        {BUTTON_SIZES.map((size, index) => (
          <Button
            key={size}
            variant={variant as never}
            size={size}
            disabled={disabled}
          >
            {getLabel(size, index)}
          </Button>
        ))}
      </div>
    </div>
  );
}
