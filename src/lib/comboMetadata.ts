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

export const ALL_COMBO_SUBJECT_DEFINITIONS: Record<string, ComboSubject> = {
  tamil: {
    name: 'Tamil',
    shortName: 'Tamil',
    tamilName: 'தமிழ்',
    icon: '📘',
    tag: 'Language I',
    color: 'bg-blue-50 text-blue-800 border-blue-200',
    description: 'Prose, Poetry, Ilakkanam & 1-Mark Model Papers',
  },
  english: {
    name: 'English',
    shortName: 'English',
    icon: '📙',
    tag: 'Language II',
    color: 'bg-amber-50 text-amber-800 border-amber-200',
    description: 'Grammar, Vocabulary, Composition & Textbook Exercises',
  },
  mathematics: {
    name: 'Mathematics',
    shortName: 'Maths',
    tamilName: 'கணிதம்',
    icon: '📐',
    tag: 'Compulsory',
    color: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    description: 'Step-by-step solved sums, Geometry, Graphs & Formula bank',
  },
  maths: {
    name: 'Mathematics',
    shortName: 'Maths',
    tamilName: 'கணிதம்',
    icon: '📐',
    tag: 'Compulsory',
    color: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    description: 'Step-by-step solved sums, Geometry, Graphs & Formula bank',
  },
  science: {
    name: 'Science',
    shortName: 'Science',
    tamilName: 'அறிவியல்',
    icon: '🔬',
    tag: 'Compulsory',
    color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Physics, Chemistry & Biology with diagrams & 5-mark answers',
  },
  'social science': {
    name: 'Social Science',
    shortName: 'Social',
    tamilName: 'சமூக அறிவியல்',
    icon: '🌍',
    tag: 'Compulsory',
    color: 'bg-rose-50 text-rose-800 border-rose-200',
    description: 'History, Geography, Civics, Economics & Map study guide',
  },
  social: {
    name: 'Social Science',
    shortName: 'Social',
    tamilName: 'சமூக அறிவியல்',
    icon: '🌍',
    tag: 'Compulsory',
    color: 'bg-rose-50 text-rose-800 border-rose-200',
    description: 'History, Geography, Civics, Economics & Map study guide',
  },
  physics: {
    name: 'Physics',
    shortName: 'Physics',
    tamilName: 'இயற்பியல்',
    icon: '⚡',
    tag: 'Major Subject',
    color: 'bg-purple-50 text-purple-800 border-purple-200',
    description: 'Formulas, Derivations, Circuit diagrams & Numerical problems',
  },
  chemistry: {
    name: 'Chemistry',
    shortName: 'Chemistry',
    tamilName: 'வேதியியல்',
    icon: '🧪',
    tag: 'Major Subject',
    color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Chemical reactions, Equations, Organic reaction mechanisms',
  },
  biology: {
    name: 'Biology',
    shortName: 'Biology',
    tamilName: 'உயிரியல்',
    icon: '🧬',
    tag: 'Major Subject',
    color: 'bg-rose-50 text-rose-800 border-rose-200',
    description: 'Botany & Zoology diagrams with marked labels & Key notes',
  },
  'computer science': {
    name: 'Computer Science',
    shortName: 'Comp. Sci',
    tamilName: 'கணினி அறிவியல்',
    icon: '💻',
    tag: 'Major Subject',
    color: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    description: 'Python programming, C++, Database concepts & Practical exercises',
  },
  botany: {
    name: 'Botany',
    shortName: 'Botany',
    tamilName: 'தாவரவியல்',
    icon: '🌿',
    tag: 'Major Subject',
    color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Plant anatomy, Taxonomy, Physiology & Practical diagrams',
  },
  zoology: {
    name: 'Zoology',
    shortName: 'Zoology',
    tamilName: 'விலங்கியல்',
    icon: '🐾',
    tag: 'Major Subject',
    color: 'bg-amber-50 text-amber-800 border-amber-200',
    description: 'Animal physiology, Genetics, Human immunology & Diagram drills',
  },
  commerce: {
    name: 'Commerce',
    shortName: 'Commerce',
    tamilName: 'வணிகவியல்',
    icon: '📊',
    tag: 'Major Subject',
    color: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    description: 'Unit-wise questions, Case studies & Public exam models',
  },
  accountancy: {
    name: 'Accountancy',
    shortName: 'Accounts',
    tamilName: 'கணக்குப்பதிவியல்',
    icon: '💼',
    tag: 'Major Subject',
    color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Ledger solutions, Journal entries & Balance sheet drills',
  },
  economics: {
    name: 'Economics',
    shortName: 'Economics',
    tamilName: 'பொருளியல்',
    icon: '📈',
    tag: 'Major Subject',
    color: 'bg-rose-50 text-rose-800 border-rose-200',
    description: 'Micro/Macro theory diagrams, Equations & Important Q&A',
  },
  'business mathematics': {
    name: 'Business Mathematics',
    shortName: 'B.Maths',
    tamilName: 'வணிகக் கணிதம்',
    icon: '📐',
    tag: 'Major Subject',
    color: 'bg-teal-50 text-teal-800 border-teal-200',
    description: 'Matrices, Financial mathematics, Statistics & Worked sums',
  },
  'computer applications': {
    name: 'Computer Applications',
    shortName: 'Comp. App',
    tamilName: 'கணினிப் பயன்பாடுகள்',
    icon: '🖥️',
    tag: 'Elective',
    color: 'bg-blue-50 text-blue-800 border-blue-200',
    description: 'DTP, Multimedia, HTML, E-Commerce & Office applications',
  },
  history: {
    name: 'History',
    shortName: 'History',
    tamilName: 'வரலாறு',
    icon: '🏛️',
    tag: 'Major Subject',
    color: 'bg-amber-50 text-amber-800 border-amber-200',
    description: 'Timeline charts, Indian freedom struggle & World history',
  },
  geography: {
    name: 'Geography',
    shortName: 'Geography',
    tamilName: 'புவியியல்',
    icon: '🗺️',
    tag: 'Major Subject',
    color: 'bg-teal-50 text-teal-800 border-teal-200',
    description: 'Physical geography, Maps, Climate & Resource distributions',
  },
};

export const STANDARD_COMBO_CHOICES = [
  { name: 'Tamil', icon: '📘', tamilName: 'தமிழ்' },
  { name: 'English', icon: '📙', tamilName: '' },
  { name: 'Mathematics', icon: '📐', tamilName: 'கணிதம்' },
  { name: 'Science', icon: '🔬', tamilName: 'அறிவியல்' },
  { name: 'Social Science', icon: '🌍', tamilName: 'சமூக அறிவியல்' },
  { name: 'Physics', icon: '⚡', tamilName: 'இயற்பியல்' },
  { name: 'Chemistry', icon: '🧪', tamilName: 'வேதியியல்' },
  { name: 'Biology', icon: '🧬', tamilName: 'உயிரியல்' },
  { name: 'Computer Science', icon: '💻', tamilName: 'கணினி அறிவியல்' },
  { name: 'Botany', icon: '🌿', tamilName: 'தாவரவியல்' },
  { name: 'Zoology', icon: '🐾', tamilName: 'விலங்கியல்' },
  { name: 'Commerce', icon: '📊', tamilName: 'வணிகவியல்' },
  { name: 'Accountancy', icon: '💼', tamilName: 'கணக்குப்பதிவியல்' },
  { name: 'Economics', icon: '📈', tamilName: 'பொருளியல்' },
  { name: 'Business Mathematics', icon: '📐', tamilName: 'வணிகக் கணிதம்' },
  { name: 'Computer Applications', icon: '🖥️', tamilName: 'கணினிப் பயன்பாடுகள்' },
];

export function getComboIncludedSubjects(product: {
  cls?: string | null;
  title?: string | null;
  category?: string | null;
  description?: string | null;
  comboSubjects?: string[] | null;
  included_subjects?: string[] | null;
}): ComboSubject[] {
  // If admin explicitly selected subjects for this combo, prioritize them 100%
  const explicitList = product.comboSubjects || product.included_subjects;
  if (Array.isArray(explicitList) && explicitList.length > 0) {
    return explicitList.map((subName) => {
      const key = String(subName).trim().toLowerCase();
      if (ALL_COMBO_SUBJECT_DEFINITIONS[key]) {
        return ALL_COMBO_SUBJECT_DEFINITIONS[key];
      }
      return {
        name: subName,
        shortName: subName.length > 14 ? subName.slice(0, 12) + '…' : subName,
        icon: '📖',
        tag: 'Full Guide',
        color: 'bg-slate-50 text-slate-800 border-slate-200',
        description: `Complete ${subName} study notes, exercise solutions & exam question bank.`,
      };
    });
  }

  const cls = String(product.cls || '').toLowerCase();
  const title = String(product.title || '').toLowerCase();

  // 11th & 12th Standard Groups
  if (cls.includes('11') || cls.includes('12')) {
    if (title.includes('commerce') || title.includes('arts') || title.includes('account')) {
      return [
        ALL_COMBO_SUBJECT_DEFINITIONS.tamil,
        ALL_COMBO_SUBJECT_DEFINITIONS.english,
        ALL_COMBO_SUBJECT_DEFINITIONS.commerce,
        ALL_COMBO_SUBJECT_DEFINITIONS.accountancy,
        ALL_COMBO_SUBJECT_DEFINITIONS.economics,
        ALL_COMBO_SUBJECT_DEFINITIONS['business mathematics'],
      ];
    }

    // Default to Higher Secondary Science (Biology / Maths Group)
    return [
      ALL_COMBO_SUBJECT_DEFINITIONS.tamil,
      ALL_COMBO_SUBJECT_DEFINITIONS.english,
      ALL_COMBO_SUBJECT_DEFINITIONS.mathematics,
      ALL_COMBO_SUBJECT_DEFINITIONS.physics,
      ALL_COMBO_SUBJECT_DEFINITIONS.chemistry,
      ALL_COMBO_SUBJECT_DEFINITIONS.biology,
    ];
  }

  // Standard 6th, 7th, 8th, 9th, 10th (Samacheer Kalvi 5 Core Subjects)
  return [
    ALL_COMBO_SUBJECT_DEFINITIONS.tamil,
    ALL_COMBO_SUBJECT_DEFINITIONS.english,
    ALL_COMBO_SUBJECT_DEFINITIONS.mathematics,
    ALL_COMBO_SUBJECT_DEFINITIONS.science,
    ALL_COMBO_SUBJECT_DEFINITIONS['social science'],
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
