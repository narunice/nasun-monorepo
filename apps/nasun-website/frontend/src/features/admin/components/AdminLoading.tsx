export function AdminLoading() {
  return (
    <div className="min-h-screen bg-nasun-c6 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-nasun-c4 mx-auto mb-4" />
        <p className="text-white/70">Verifying admin access...</p>
      </div>
    </div>
  );
}
