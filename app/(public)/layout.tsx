import { PublicHeader } from "@/components/PublicHeader";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
