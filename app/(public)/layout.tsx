import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { MotionProvider } from "@/components/motion/MotionProvider";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionProvider>
      <div className="flex min-h-full flex-col">
        <PublicHeader />
        <AnnouncementBanner />
        <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">{children}</main>
        <PublicFooter />
      </div>
    </MotionProvider>
  );
}
