// src/pages/ComponentShowcasePage.tsx
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";

// Button variant definitions
const buttonSolidVariants = [
  "black",
  "white",
  "scarlet",
  "c1",
  "c2",
  "c3",
  "c4",
  "c5",
  "coral",
  "green",
  "gensol-red",
] as const;

const buttonOutlineVariants = [
  "outlineScarlet",
  "outlineC1",
  "outlineC2",
  "outlineC3",
  "outlineC4",
  "outlineC5",
  "outlineCoral",
  "outlineGensolRed",
] as const;

const buttonFilledOutlineVariants = [
  "filledOutlineScarlet",
  "filledOutlineC1",
  "filledOutlineC2",
  "filledOutlineC3",
  "filledOutlineC4",
  "filledOutlineC5",
  "filledOutlineCoral",
  "filledOutlineGensolRed",
] as const;

const buttonSpecialVariants = ["ghost", "link", "destructive"] as const;

const buttonSizes = ["xs", "sm", "default", "md", "lg", "xl", "2xl", "hero", "icon"] as const;

// Tag variant definitions
const tagFilledVariants = [
  "filledScarlet",
  "filledC1",
  "filledC2",
  "filledC3",
  "filledC4",
  "filledC5",
  "filledGensolRed",
] as const;

const tagOutlineVariants = [
  "outlineScarlet",
  "outlineC1",
  "outlineC2",
  "outlineC3",
  "outlineC4",
  "outlineC5",
  "outlineGensolRed",
] as const;

const tagSizes = ["xs", "sm", "default", "md", "lg"] as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold text-white mb-6 mt-12 first:mt-0">{children}</h2>;
}

function SubsectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-nasun-c4 mb-4 mt-8 first:mt-0">{children}</h3>;
}

function VariantLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-gray-500 font-mono">{children}</span>;
}

export default function ComponentShowcasePage() {
  return (
    <div className="bg-nasun-black min-h-screen py-20 px-8 md:px-12 lg:px-16">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-4">Component Showcase</h1>
        <p className="text-gray-400 mb-12">
          All available Button and Tag component variants and sizes.
        </p>

        {/* Button Section */}
        <SectionTitle>Button Component</SectionTitle>

        {/* Solid Variants */}
        <SubsectionTitle>Solid Variants</SubsectionTitle>
        <div className="flex flex-wrap gap-4 items-end">
          {buttonSolidVariants.map((variant) => (
            <div key={variant} className="flex flex-col items-center gap-2">
              <Button variant={variant}>Read More</Button>
              <VariantLabel>{variant}</VariantLabel>
            </div>
          ))}
        </div>

        {/* Outline Variants */}
        <SubsectionTitle>Outline Variants</SubsectionTitle>
        <div className="flex flex-wrap gap-4 items-end">
          {buttonOutlineVariants.map((variant) => (
            <div key={variant} className="flex flex-col items-center gap-2">
              <Button variant={variant}>Read More</Button>
              <VariantLabel>{variant}</VariantLabel>
            </div>
          ))}
        </div>

        {/* Filled Outline Variants */}
        <SubsectionTitle>Filled Outline Variants</SubsectionTitle>
        <div className="flex flex-wrap gap-4 items-end">
          {buttonFilledOutlineVariants.map((variant) => (
            <div key={variant} className="flex flex-col items-center gap-2">
              <Button variant={variant}>Read More</Button>
              <VariantLabel>{variant}</VariantLabel>
            </div>
          ))}
        </div>

        {/* Special Variants */}
        <SubsectionTitle>Special Variants</SubsectionTitle>
        <div className="flex flex-wrap gap-4 items-end">
          {buttonSpecialVariants.map((variant) => (
            <div key={variant} className="flex flex-col items-center gap-2">
              <Button variant={variant}>Read More</Button>
              <VariantLabel>{variant}</VariantLabel>
            </div>
          ))}
        </div>

        {/* Button Sizes */}
        <SubsectionTitle>Size Variants</SubsectionTitle>
        <div className="flex flex-wrap gap-4 items-end">
          {buttonSizes.map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <Button size={size}>{size === "icon" ? "X" : "Read More"}</Button>
              <VariantLabel>{size}</VariantLabel>
            </div>
          ))}
        </div>

        {/* Tag Section */}
        <SectionTitle>Tag Component</SectionTitle>

        {/* Filled Variants */}
        <SubsectionTitle>Filled Variants</SubsectionTitle>
        <div className="flex flex-wrap gap-4 items-end">
          {tagFilledVariants.map((variant) => (
            <div key={variant} className="flex flex-col items-center gap-2">
              <Tag variant={variant}>Default</Tag>
              <VariantLabel>{variant}</VariantLabel>
            </div>
          ))}
        </div>

        {/* Outline Variants */}
        <SubsectionTitle>Outline Variants</SubsectionTitle>
        <div className="flex flex-wrap gap-4 items-end">
          {tagOutlineVariants.map((variant) => (
            <div key={variant} className="flex flex-col items-center gap-2">
              <Tag variant={variant}>Default</Tag>
              <VariantLabel>{variant}</VariantLabel>
            </div>
          ))}
        </div>

        {/* Tag Sizes */}
        <SubsectionTitle>Size Variants</SubsectionTitle>
        <div className="flex flex-wrap gap-4 items-end">
          {tagSizes.map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <Tag size={size}>Default</Tag>
              <VariantLabel>{size}</VariantLabel>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
