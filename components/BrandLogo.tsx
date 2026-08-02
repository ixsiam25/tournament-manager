import Image from "next/image";

// Base size bumped 36 -> 45 (x1.25) by request; AdminNav still passes its
// own smaller explicit size.
export function BrandLogo({ size = 45 }: { size?: number }) {
  return (
    <Image
      src="/logo.jpg"
      alt="BFL"
      width={size}
      height={size}
      className="shrink-0 rounded-block object-cover"
      priority
    />
  );
}
