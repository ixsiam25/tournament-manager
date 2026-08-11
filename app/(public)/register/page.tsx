import { RegistrationForm } from "@/components/RegistrationForm";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <div>
      <h1 className="mb-2 heading-display text-2xl">Register</h1>
      <p className="mb-6 text-muted">Sign up to play this season.</p>
      <RegistrationForm />
    </div>
  );
}
