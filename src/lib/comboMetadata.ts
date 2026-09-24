/**
 * Combo Pack Metadata & Subject Showcase Utilities
 * Provides subject breakdowns, icons, and savings analytics for Tamil Nadu State Board combo sets.
 */

export interface ComboSubject {
  name: string;
  shortName: string;
  tamilName?: string;
  icon: string;
  tag: string;
  color: string;
  description: string;
}

export interface ComboSavingsSummary {
  individualMrp: number;
  comboPrice: number;
  cashSavings: number;
  freeDeliverySavings: number;
  totalCustomerSavings: number;
  subjectCount: number;
}

export function getComboIncludedSubjects(product: {
  cls?: string | null;
  title?: string | null;
  category?: string | null;
  description?: string | null;
}): ComboSubject[] {
  const cls = String(product.cls || '').toLowerCase();
  const title = String(product.title || '').toLowerCase();

  // 11th & 12th Standard Groups
  if (cls.includes('11') || cls.includes('12')) {
    if (title.includes('commerce') || title.includes('arts') || title.includes('account')) {
      return [
        { name: 'Tamil', shortName: 'Tamil', tamilName: 'தமிழ்', icon: '📘', tag: 'Core Language', color: 'bg-blue-50 text-blue-800 border-blue-200', description: 'Complete Prose, Poetry, Grammar & 1-mark bank' },
        { name: 'English', shortName: 'English', icon: '📙', tag: 'Core Language', color: 'bg-amber-50 text-amber-800 border-amber-200', description: 'Vocabulary, Grammar, Comprehension & Literature' },
        { name: 'Commerce', shortName: 'Commerce', icon: '📊', tag: 'Major Subject', color: 'bg-indigo-50 text-indigo-800 border-indigo-200', description: 'Unit-wise questions, Case studies & Public exam models' },
        { name: 'Accountancy', shortName: 'Accountancy', icon: '💼', tag: 'Major Subject', color: 'bg-emerald-50 text-emerald-800 border-emerald-200', description: 'Ledger solutions, Journal entries & Balance sheet drills' },
        { name: 'Economics', shortName: 'Economics', icon: '📈', tag: 'Major Subject', color: 'bg-rose-50 text-rose-800 border-rose-200', description: 'Micro/Macro theory diagrams, Equations & Important Q&A' },
        { name: 'Business Maths / CS', shortName: 'B.Maths / CS', icon: '📐', tag: 'Elective', color: 'bg-teal-50 text-teal-800 border-teal-200', description: 'Full worked solutions & Practical lab question bank' },
      ];
    }

    // Default to Higher Secondary Science (Biology / Maths Group)
    return [
      { name: 'Tamil', shortName: 'Tamil', tamilName: 'தமிழ்', icon: '📘', tag: 'Core Language', color: 'bg-blue-50 text-blue-800 border-blue-200', description: 'Complete Prose, Poetry, Grammar & 1-mark bank' },
      { name: 'English', shortName: 'English', icon: '📙', tag: 'Core Language', color: 'bg-amber-50 text-amber-800 border-amber-200', description: 'Vocabulary, Grammar, Comprehension & Literature' },
      { name: 'Mathematics', shortName: 'Maths', icon: '📐', tag: 'Major Subject', color: 'bg-indigo-50 text-indigo-800 border-indigo-200', description: 'Step-by-step worked solutions for every exercise' },
      { name: 'Physics', shortName: 'Physics', icon: '⚡', tag: 'Major Subject', color: 'bg-purple-50 text-purple-800 border-purple-200', description: 'Formulas, Derivations, Circuit diagrams & Numerical problems' },
      { name: 'Chemistry', shortName: 'Chemistry', icon: '🔬', tag: 'Major Subject', color: 'bg-emerald-50 text-emerald-800 border-emerald-200', description: 'Chemical reactions, Equations, Organic reaction mechanisms' },
      { name: 'Biology', shortName: 'Biology', icon: '🧬', tag: 'Major Subject', color: 'bg-rose-50 text-rose-800 border-rose-200', description: 'Botany & Zoology diagrams with marked labels & Key notes' },
    ];
  }

  // Standard 6th, 7th, 8th, 9th, 10th (Samacheer Kalvi 5 Core Subjects)
  return [
    { name: 'Tamil', shortName: 'Tamil', tamilName: 'தமிழ்', icon: '📘', tag: 'Language I', color: 'bg-blue-50 text-blue-800 border-blue-200', description: 'Prose, Poetry, Ilakkanam & 1-Mark Model Papers' },
    { name: 'English', shortName: 'English', icon: '📙', tag: 'Language II', color: 'bg-amber-50 text-amber-800 border-amber-200', description: 'Grammar, Vocabulary, Composition & Textbook Exercises' },
    { name: 'Mathematics', shortName: 'Maths', icon: '📐', tag: 'Compulsory', color: 'bg-indigo-50 text-indigo-800 border-indigo-200', description: 'Step-by-step solved sums, Geometry, Graphs & Formula bank' },
    { name: 'Science', shortName: 'Science', icon: '🔬', tag: 'Compulsory', color: 'bg-emerald-50 text-emerald-800 border-emerald-200', description: 'Physics, Chemistry & Biology with diagrams & 5-mark answers' },
    { name: 'Social Science', shortName: 'Social Science', icon: '🌍', tag: 'Compulsory', color: 'bg-rose-50 text-rose-800 border-rose-200', description: 'History, Geography, Civics, Economics & Map study guide' },
  ];
}

export function getComboSavingsSummary(product: {
  price: number;
  mrp: number;
  cls?: string | null;
  title?: string | null;
}): ComboSavingsSummary {
  const subjects = getComboIncludedSubjects(product);
  const subjectCount = subjects.length;
  const comboPrice = Number(product.price || 1300);
  const individualMrp = Math.max(Number(product.mrp || 1650), comboPrice + 350);
  const cashSavings = Math.max(0, individualMrp - comboPrice);
  const freeDeliverySavings = 150; // Standard courier fee saved
  const totalCustomerSavings = cashSavings + freeDeliverySavings;

  return {
    individualMrp,
    comboPrice,
    cashSavings,
    freeDeliverySavings,
    totalCustomerSavings,
    subjectCount,
  };
}
