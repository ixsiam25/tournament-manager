import { ApplicationEditor } from "@/components/ApplicationEditor";

export const dynamic = "force-dynamic";
// The token is a credential: keep this page out of search indexes.
export const metadata = { robots: { index: false, follow: false } };

export default async function EditApplicationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">Your application</h1>
      <p className="mb-6 text-muted-foreground">Fix your details or photo while your application is still waiting for review.</p>
      <ApplicationEditor token={token} />
    </div>
  );
}
