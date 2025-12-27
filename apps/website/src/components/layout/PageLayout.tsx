export const PageLayout = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <main
      className={`min-h-screen w-full flex flex-col py-4 md:py-6 lg:py-8 xl:py-10 ${className}`}
    >
      {children}
    </main>
  );
};
