// /components/common/CallToAction.tsx
import { SectionLayout } from "../layout/SectionLayout";
import { Button } from "../ui/button";

interface CallToActionProps {
  title: string;
  description: string;
  buttonText: string;
  onButtonClick?: () => void;
  className?: string;
}

export default function CallToActionSection({
  title,
  description,
  buttonText,
  onButtonClick,
  className = "",
}: CallToActionProps) {
  return (
    <SectionLayout className="!px-0">
      <div
        className={`py-16 border-t-1 border-b-1 border-gray-600/40 bg-gray-800/10 ${className}`}
      >
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="mb-6">{title}</h2>
          <p className="mb-8 max-w-2xl mx-auto">
            {description}
          </p>

          <Button variant="sunshine" size="lg" onClick={onButtonClick}>
            {buttonText}
          </Button>
        </div>
      </div>
    </SectionLayout>
  );
}
