import Image from 'next/image';

type BrandLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

/** Official crowned-B mark — use anywhere the brand icon appears. */
export function BrandLogo({ size = 40, className = '', priority = false }: BrandLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="Blessing Power Guide"
      width={size}
      height={size}
      priority={priority}
      className={`rounded-[22%] object-contain flex-shrink-0 ${className}`}
    />
  );
}
