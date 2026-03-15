"use client";

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[calc(100vh-4rem)] -mx-4 -my-6 lg:-mx-8">
      {children}
    </div>
  );
}
