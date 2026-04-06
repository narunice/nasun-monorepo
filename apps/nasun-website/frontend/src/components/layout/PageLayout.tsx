export const PageLayout = ({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) => {
  return (
    <main
      id="main-content"
      className={`min-h-screen w-full flex flex-col py-4 md:py-6 lg:py-8 xl:py-10 ${className}`}
      style={style}
    >
      {children}
    </main>
  );
};
