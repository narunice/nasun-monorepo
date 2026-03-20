import { FC, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface NftImageModalProps {
  src: string;
  alt?: string;
  thumbnailClassName?: string;
}

export const NftImageModal: FC<NftImageModalProps> = ({
  src,
  alt = "Vote Proof NFT",
  thumbnailClassName = "w-12 h-12 rounded-full border-2 border-green-500/40",
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`${thumbnailClassName} cursor-pointer hover:opacity-80 transition-opacity`}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
      />
      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-nasun-black/80 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setIsOpen(false)}
              className="absolute -top-3 -right-3 w-8 h-8 flex items-center justify-center rounded-full bg-nasun-black/80 border border-nasun-white/20 text-nasun-white/70 hover:text-nasun-white hover:bg-nasun-black transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={src}
              alt={alt}
              className="max-w-[80vw] max-h-[80vh] rounded-lg shadow-2xl"
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
