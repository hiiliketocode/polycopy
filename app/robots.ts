import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/profile', '/admin/'],
    },
    sitemap: 'https://polycopy.app/sitemap.xml',
  }
}
