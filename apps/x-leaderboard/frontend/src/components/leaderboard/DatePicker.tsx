import React from "react";
import { CalendarIcon } from "@radix-ui/react-icons";
import { useTranslation } from "react-i18next";

interface DatePickerProps {
  selectedDate: string | null;
  onDateChange: (date: string | null) => void;
  maxDate?: string;
  minDate?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string; // 🆕 레이블 prop 추가
}

export const DatePicker: React.FC<DatePickerProps> = ({
  selectedDate,
  onDateChange,
  maxDate,
  minDate,
  placeholder = "날짜 선택",
  disabled = false,
  className = "",
  label, // 🆕
}) => {
  const { t } = useTranslation("leaderboard");
  // 오늘 날짜를 YYYY-MM-DD 형식으로 변환
  const today = new Date().toISOString().split("T")[0];

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    onDateChange(value || null);
  };

  const handleClear = () => {
    onDateChange(null);
  };

  return (
    <div className={`relative flex items-center w-full ${className}`}>
      {/* 날짜 입력 필드 컨테이너 (레이블, 아이콘, input 포함) */}
      <div
        className={`
        relative flex items-center gap-2
        px-3 py-1
        border rounded-lg
        bg-black/60
        border-nasun-c3/50
        hover:border-nasun-c3/70
        ${disabled ? "bg-gray-700 cursor-not-allowed" : ""}
        ${selectedDate === today ? "bg-gray-700 border-nasun-c3/70" : ""}
      `}
      >
        {/* 🆕 레이블 (달력 아이콘 왼쪽) */}
        {label && <span className="font-medium text-white whitespace-nowrap">{label}</span>}

        {/* 달력 아이콘 */}
        <CalendarIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />

        {/* 날짜 입력 필드 (오른쪽 달력 아이콘 투명하게 처리) */}
        <input
          type="date"
          value={selectedDate || ""}
          onChange={handleDateChange}
          max={maxDate || today}
          min={minDate}
          disabled={disabled}
          className={`
            flex-1
            bg-transparent
            border-none
            outline-none
            font-medium
            cursor-pointer
            ${selectedDate ? "text-white" : "text-gray-400"}
            disabled:cursor-not-allowed
            [&::-webkit-calendar-picker-indicator]:opacity-0
            [&::-webkit-calendar-picker-indicator]:absolute
            [&::-webkit-calendar-picker-indicator]:right-0
            [&::-webkit-calendar-picker-indicator]:w-full
            [&::-webkit-calendar-picker-indicator]:h-full
            [&::-webkit-calendar-picker-indicator]:cursor-pointer
            [&::-webkit-inner-spin-button]:hidden
            [&::-webkit-clear-button]:hidden
          `}
          style={{
            colorScheme: "light dark",
          }}
          placeholder={placeholder}
          title={
            selectedDate === today ? "오늘 날짜 선택됨 - 실시간 리더보드를 표시합니다" : undefined
          }
        />
      </div>

      {/* 클리어 버튼 (선택된 날짜가 있을 때만 표시) */}
      {selectedDate && !disabled && (
        <button
          onClick={handleClear}
          className="ml-2 px-3 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg"
          title={t("snapshot.deselectDate")}
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default DatePicker;
