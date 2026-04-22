interface UjuLayoutProps {
  children: React.ReactNode;
}

export function UjuLayout({ children }: UjuLayoutProps) {
  return (
    <div className="bg-uju-bg min-h-screen">
      {children}
    </div>
  );
}
