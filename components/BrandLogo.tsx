import Image from "next/image";

export function BrandLogo({ size = 36 }: { size?: number }) {
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
