// components/ui/Pagination.tsx

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const handlePrevPage = () => onPageChange(currentPage - 1);
  const handleNextPage = () => onPageChange(currentPage + 1);

  return (
    <div className="flex justify-center items-center gap-1 mt-8">
      <button
        onClick={handlePrevPage}
        disabled={currentPage === 1}
        className={`p-2 rounded-lg ${
          currentPage === 1
            ? "text-nasun-white/30 cursor-not-allowed"
            : "hover:bg-gray-700/20 hover:scale-110 active:scale-95 transition-all"
        }`}
        aria-label="Previous page"
      >
        &lt;
      </button>

      <div className="flex items-center gap-1 mx-1">
        {Array.from({ length: totalPages }).map((_, index) => (
          <button
            key={index}
            onClick={() => onPageChange(index + 1)}
            className={`relative w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
              currentPage === index + 1
                ? "font-bold bg-nasun-c2 after:content-[''] after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-3/5 after:h-[2px] after:bg-nasun-black "
                : "hover:bg-gray-700/20 hover:scale-105 active:scale-95 transition-all"
            }`}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <button
        onClick={handleNextPage}
        disabled={currentPage === totalPages}
        className={`p-2 rounded-lg ${
          currentPage === totalPages
            ? "text-nasun-white/30 cursor-not-allowed"
            : "hover:bg-gray-700/20 hover:scale-110 active:scale-95 transition-all"
        }`}
        aria-label="Next page"
      >
        &gt;
      </button>
    </div>
  );
}
