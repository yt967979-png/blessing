import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Blessing Power Guide',
    short_name: 'Blessing',
    description: 'Premium educational guide books for classes 6–12 (TN / CBSE).',
    start_url: '/',
    display: 'standalone',
    background_color: '#001B3A',
    theme_color: '#001B3A',
    icons: [
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
