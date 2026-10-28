import type { Metadata } from "next";
import { RegistrationForm } from "@/components/RegistrationForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register" };

export default function RegisterPage() {
  return <RegistrationForm />;
}
