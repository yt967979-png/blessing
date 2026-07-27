import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Blessing Power Guide',
    short_name: 'Blessing',
    description: 'Premium educational guide books for classes 6–12 (TN / CBSE).',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#001B3A',
    icons: [
      {
        src: '/favicon.ico',
        sizes: '48x48',
        type: 'image/x-icon',
      },
    ],
  };
}
