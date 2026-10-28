import React from 'react';
import { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { ExamTimetableSection } from '@/components/home/ExamTimetableSection';
import { ClassPicker } from '@/components/home/ClassPicker';
import { ProductGrid } from '@/components/home/ProductGrid';
import { serializeJsonLd } from '@/lib/jsonLd';

export const metadata: Metadata = {
  title: 'Tamil Nadu 10th & 12th Board Exam Timetable 2026–2027 | Blessing Power Guide',
  description:
    'Official Tamil Nadu Directorate of Government Examinations (DGE) 10th SSLC and 12th HSC Public Examination Timetable, daily timings, countdown clock, and Samacheer Kalvi preparation guides.',
  keywords: [
    '10th exam timetable 2026 tamil nadu',
    '12th public exam timetable 2026',
    'TN DGE exam dates',
    'SSLC exam schedule samacheer kalvi',
    'blessing power guide 10th combo',
  ],
  openGraph: {
    title: 'TN 10th & 12th Public Exam Timetable 2026–2027 | Blessing Power Guide',
    description:
      'Official TN DGE Board Exam Timetable, subject codes, timings, and recommended 5-in-1 combo preparation guides.',
    url: 'https://blessingpowerguide.in/exam-timetable',
    type: 'website',
  },
};

export default function ExamTimetablePage() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.in';

  const timetableSchema = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalCredential',
    name: 'Tamil Nadu 10th SSLC & 12th HSC Public Examination Timetable 2026–2027',
    description:
      'Official examination timetable published by the Directorate of Government Examinations (DGE), Government of Tamil Nadu.',
    url: `${siteUrl}/exam-timetable`,
    provider: {
      '@type': 'EducationalOrganization',
      name: 'Directorate of Government Examinations, Tamil Nadu',
      sameAs: 'https://www.dge.tn.gov.in',
    },
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(timetableSchema) }}
      />
      <AnnouncementBar />
      <Header />
      <div className="pt-2 sm:pt-4">
        {/* Force show on dedicated page even if campaign status is draft */}
        <ExamTimetableSection forceShow={true} />
      </div>
      <ClassPicker />
      <ProductGrid />
      <Footer />
    </main>
  );
}
