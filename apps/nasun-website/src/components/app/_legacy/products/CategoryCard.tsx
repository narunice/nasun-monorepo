import React from "react";

interface CategoryCardProps {
  category: string;
  emoji: string;
  isActive: boolean;
  isFlipped: boolean;
  transitionDelay: string;
}

const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  emoji,
  isActive,
  isFlipped,
  transitionDelay,
}) => {
  return (
    <div
      className={`relative h-12 md:h-16 lg:h-20 transition-all duration-800 ${
        isActive ? "opacity-100 scale-100" : "opacity-0 scale-90"
      }`}
      style={{ transitionDelay, perspective: "1000px" }}
    >
      <div
        className="relative w-full h-full transition-transform duration-1000 ease-out"
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(0deg)" : "rotateY(180deg)",
        }}
      >
        {/* 카드 앞면 (텍스트) */}
        <div
          className={`absolute inset-0 backface-hidden flex items-center justify-center p-2 border rounded-lg ${
            isActive ? "border-gray-600" : "border-transparent"
          }`}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            zIndex: isFlipped ? 0 : 1,
          }}
        >
          <p className="text-center text-xs md:text-sm lg:text-base">{category}</p>
        </div>

        {/* 카드 뒷면 (이모지) */}
        <div
          className={`absolute inset-0 backface-hidden flex items-center justify-center p-2 border rounded-lg ${
            isActive ? "border-gray-600" : "border-transparent"
          }`}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(0deg)",
            zIndex: isFlipped ? 1 : 0,
          }}
        >
          <span className="text-2xl">{emoji}</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CategoryCard);
