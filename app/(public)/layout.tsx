import { PublicHeader } from "@/components/PublicHeader";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <PublicHeader />
      <AnnouncementBanner />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
