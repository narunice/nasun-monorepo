import { useState, useCallback } from "react";
import { toast } from "react-toastify";

export function useImageGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateAndDownload = useCallback(
    async (element: HTMLElement | null, filename: string) => {
      if (!element || isGenerating) return;

      setIsGenerating(true);
      try {
        const html2canvas = await import("html2canvas").then((m) => m.default);
        const canvas = await html2canvas(element, {
          backgroundColor: "#191615",
          scale: 2,
          useCORS: true,
          allowTaint: false,
          imageTimeout: 15000,
        });

        const link = document.createElement("a");
        link.download = filename;
        link.href = canvas.toDataURL("image/png");
        link.click();
        toast.success("Image downloaded!");
      } catch (error) {
        console.error("Failed to generate image:", error);
        toast.error("Failed to download image");
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating]
  );

  return { isGenerating, generateAndDownload };
}
