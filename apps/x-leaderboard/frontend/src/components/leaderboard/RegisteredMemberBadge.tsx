import React from 'react';

interface RegisteredMemberBadgeProps {
  size?: number;
  className?: string;
}

/**
 * NASUN 웹사이트에 X 계정을 연동한 사용자에게 표시되는 뱃지
 * - X 로그인으로 가입한 사용자
 * - Google 로그인 후 X 계정을 연동한 사용자
 */
export const RegisteredMemberBadge: React.FC<RegisteredMemberBadgeProps> = ({
  size = 16,
  className = ""
}) => {
  return (
    <div
      className={`
        flex items-center justify-center
        bg-white/10
        rounded-lg-full p-1
        ${className}
      `}
      title="NASUN 웹사이트 등록 회원"
      aria-label="Registered Member"
    >
      <span
        className="text-white font-bold"
        style={{ fontSize: size }}
      >
        ✓
      </span>
    </div>
  );
};

export default RegisteredMemberBadge;
