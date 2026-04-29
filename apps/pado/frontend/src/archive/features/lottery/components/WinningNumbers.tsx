interface WinningNumbersProps {
  numbers: number[];
  userNumbers?: number[];
}

export function WinningNumbers({ numbers, userNumbers }: WinningNumbersProps) {
  const matchingNumbers = userNumbers
    ? new Set(userNumbers.filter((n) => numbers.includes(n)))
    : new Set<number>();

  return (
    <div className="flex gap-2 items-center">
      {numbers.map((num, index) => {
        const isMatching = matchingNumbers.has(num);
        return (
          <div
            key={index}
            className={`
              w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
              ${
                isMatching
                  ? 'bg-green-500 text-white'
                  : 'bg-theme-bg-tertiary text-theme-text-primary'
              }
            `}
          >
            {num}
          </div>
        );
      })}
      {userNumbers && (
        <span className="ml-2 text-sm text-theme-text-secondary">
          {matchingNumbers.size} match{matchingNumbers.size !== 1 ? 'es' : ''}
        </span>
      )}
    </div>
  );
}
