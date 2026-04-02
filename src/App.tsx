import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";

declare global {
  interface Window {
    puter?: {
      ai?: {
        chat: (
          input: string | Array<{ role: string; content: string }>,
          options?: { model?: string; stream?: boolean },
        ) => Promise<
          | string
          | {
              message?: {
                content?: Array<{ text?: string }> | { text?: string };
              };
            }
        >;
      };
    };
  }
}

type Role = "student" | "admin";
type View = "dashboard" | "results" | "planner" | "books" | "admin";
type AiMode = "anthropic" | "openrouter" | "puter" | "free-local" | "free-demo";

interface AiConfig {
  id: AiMode;
  providerLabel: string;
  label: string;
  apiModel: string;
  thinking: string;
  costLabel: string;
  description: string;
  backendNote: string;
}

interface ApiSettings {
  anthropicApiKey: string;
  anthropicBaseUrl: string;
  anthropicVersion: string;
  openRouterApiKey: string;
  openRouterBaseUrl: string;
  openRouterModel: string;
  openRouterSiteUrl: string;
  openRouterAppTitle: string;
  allowBrowserCalls: boolean;
}

interface User {
  id: string;
  fullName: string;
  username: string;
  email: string;
  password: string;
  role: Role;
  createdAt: string;
  notificationEnabled: boolean;
  lastNotificationAt?: string;
}

interface Book {
  id: string;
  title: string;
  grade: string;
  course: string;
  publisher: string;
  topics: string[];
  description: string;
  uploadedBy: string;
  uploadedAt: string;
  fileName?: string;
}

interface SubjectPerformance {
  course: string;
  correct: number;
  wrong: number;
  blank: number;
}

interface ExamResult {
  id: string;
  userId: string;
  title: string;
  examType: string;
  grade: string;
  fileName?: string;
  fileType?: string;
  uploadedAt: string;
  gains: string[];
  notes: string;
  subjects: SubjectPerformance[];
  analysisMode: "auto-ai" | "manual-assisted";
  analysisSummary: string;
}

interface MappedTopic {
  gain: string;
  course: string;
  topic: string;
  sourceBook: string;
}

interface DailyTask {
  course: string;
  topic: string;
  gain: string;
  questions: number;
  minutes: number;
  sourceBook: string;
}

interface DayPlan {
  dayLabel: string;
  focus: string;
  tasks: DailyTask[];
  totalQuestions: number;
  totalMinutes: number;
  completed: boolean;
}

interface StudyPlan {
  id: string;
  userId: string;
  resultId: string;
  createdAt: string;
  model: string;
  thinking: string;
  weekRange: string;
  recommendations: string[];
  mappedTopics: MappedTopic[];
  days: DayPlan[];
}

const STORAGE = {
  users: "denemekocu_users",
  books: "denemekocu_books",
  results: "denemekocu_results",
  plans: "denemekocu_plans",
  currentUserId: "denemekocu_current_user",
  aiMode: "denemekocu_ai_mode",
  apiSettings: "denemekocu_api_settings",
} as const;

const DEFAULT_API_SETTINGS: ApiSettings = {
  anthropicApiKey: "",
  anthropicBaseUrl: "https://api.anthropic.com/v1/messages",
  anthropicVersion: "2023-06-01",
  openRouterApiKey: "",
  openRouterBaseUrl: "https://openrouter.ai/api/v1/chat/completions",
  openRouterModel: "openrouter/free",
  openRouterSiteUrl: typeof window !== "undefined" ? window.location.origin : "https://localhost",
  openRouterAppTitle: "DenemeKoçu AI",
  allowBrowserCalls: true,
};

const ADMIN_CREDENTIALS = {
  username: "superadmin",
  password: "PlanAI!2026",
};

const AI_CONFIGS: Record<AiMode, AiConfig> = {
  anthropic: {
    id: "anthropic",
    providerLabel: "Anthropic",
    label: "Claude Opus 4.6",
    apiModel: "claude-opus-4-6",
    thinking: "adaptive thinking",
    costLabel: "Ücretli API",
    description: "En yüksek kalite hedefi için Claude tabanlı akış. Gerçek kullanımda ücretli API anahtarı gerekir.",
    backendNote: "Gerçek Anthropic çağrıları istemcide değil, güvenli backend üstünden yapılmalıdır.",
  },
  openrouter: {
    id: "openrouter",
    providerLabel: "OpenRouter",
    label: "OpenRouter yönlendirmeli model",
    apiModel: "openrouter/free",
    thinking: "provider-routed reasoning",
    costLabel: "Ücretsiz / kullandığın modele göre",
    description: "OpenRouter anahtarınla ücretsiz veya ücretli farklı modeller arasında yönlendirme yapabilirsin.",
    backendNote: "OpenRouter çağrıları frontend'de test edilebilir; canlı kullanımda yine backend tercih edilir.",
  },
  puter: {
    id: "puter",
    providerLabel: "Puter.js",
    label: "Ücretsiz Puter Claude modu",
    apiModel: "claude-sonnet-4-6",
    thinking: "puter user-pays browser inference",
    costLabel: "Ücretsiz başlangıç / Puter hesabına bağlı",
    description: "Puter.js ile API key girmeden tarayıcı içinden Claude modellerini deneyebilirsin. Bu mod ücretsiz prototipleme için idealdir.",
    backendNote: "Bu mod üçüncü taraf Puter script'ine bağlı çalışır; üretimde hizmet koşulları ve veri politikası ayrıca değerlendirilmelidir.",
  },
  "free-local": {
    id: "free-local",
    providerLabel: "Yerel / ücretsiz",
    label: "Tarayıcı içi ücretsiz planlayıcı",
    apiModel: "local-heuristic-planner",
    thinking: "rule-based planning",
    costLabel: "Ücretsiz",
    description: "Sunucu maliyeti olmadan bu demodaki yerel analiz motorunu kullanır. Şu anda uygulamada aktif ücretsiz seçenek budur.",
    backendNote: "Dosyalar tarayıcı içinde kalır; gerçek OCR veya büyük model analizi yapılmaz.",
  },
  "free-demo": {
    id: "free-demo",
    providerLabel: "API olmadan demo",
    label: "Örnek AI akışı",
    apiModel: "demo-mode",
    thinking: "simulated suggestions",
    costLabel: "Ücretsiz",
    description: "Gerçek API bağlamadan ürün akışını ve prompt yapısını test etmek için kullanılır.",
    backendNote: "Bu mod sadece ürün denemesi içindir; gerçek model çağrısı yapmaz.",
  },
};

const DEFAULT_AI_MODE: AiMode = "puter";

const DAY_NAMES = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

const DEFAULT_SUBJECTS: SubjectPerformance[] = [
  { course: "Matematik", correct: 18, wrong: 9, blank: 13 },
  { course: "Türkçe", correct: 28, wrong: 6, blank: 6 },
  { course: "Fen Bilimleri", correct: 11, wrong: 7, blank: 22 },
  { course: "Sosyal Bilimler", correct: 15, wrong: 5, blank: 20 },
];

const STOP_WORDS = new Set([
  "ve",
  "ile",
  "için",
  "gibi",
  "olan",
  "olanlar",
  "bir",
  "iki",
  "üç",
  "çok",
  "az",
  "ile",
  "ama",
  "fakat",
  "daha",
  "buna",
  "şuna",
  "göre",
  "veya",
  "soru",
  "sorular",
  "konu",
  "kazanım",
  "kazanımları",
  "yanlış",
  "eksik",
  "hata",
  "deneme",
  "test",
  "genel",
]);

const COURSE_KEYWORDS: Record<string, string[]> = {
  Matematik: [
    "matematik",
    "problem",
    "problemler",
    "fonksiyon",
    "geometri",
    "trigonometri",
    "limit",
    "türev",
    "integral",
    "polinom",
    "çarpan",
    "olasılık",
    "permütasyon",
  ],
  "Türkçe": [
    "türkçe",
    "paragraf",
    "dil bilgisi",
    "sözcük",
    "cümle",
    "anlam",
    "anlatım",
    "yazım",
    "noktalama",
  ],
  "Fen Bilimleri": [
    "fen",
    "fizik",
    "kimya",
    "biyoloji",
    "basınç",
    "hareket",
    "elektrik",
    "manyetizma",
    "asit",
    "baz",
    "maddenin",
    "hücre",
    "kalıtım",
    "enerji",
  ],
  "Sosyal Bilimler": [
    "sosyal",
    "tarih",
    "coğrafya",
    "felsefe",
    "din",
    "inkılap",
    "harita",
    "osmanlı",
    "cumhuriyet",
    "nüfus",
  ],
};

const seededAt = new Date().toISOString();

const DEFAULT_USERS: User[] = [
  {
    id: "seed-admin",
    fullName: "Platform Yöneticisi",
    username: ADMIN_CREDENTIALS.username,
    email: "admin@denemekocu.local",
    password: ADMIN_CREDENTIALS.password,
    role: "admin",
    createdAt: seededAt,
    notificationEnabled: false,
  },
];

const LEGACY_SEEDED_BOOK_IDS = new Set(["book-mat-12", "book-tur-12", "book-fen-12", "book-sos-12", "book-mat-8"]);

const DEFAULT_BOOKS: Book[] = [];

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function normalize(text: string) {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9çğıöşü\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string) {
  return normalize(text)
    .split(" ")
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function overlapScore(a: string, b: string) {
  const source = new Set(tokenize(a));
  return tokenize(b).reduce((score, token) => score + (source.has(token) ? 1 : 0), 0);
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
}

function formatShortDate(dateString: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(dateString));
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function calculateNet(subject: SubjectPerformance) {
  return subject.correct - subject.wrong / 4;
}

function courseMatches(bookCourse: string, targetCourse: string) {
  const a = normalize(bookCourse);
  const b = normalize(targetCourse);

  if (a.includes(b) || b.includes(a)) return true;

  const fenKeywords = ["fen", "fizik", "kimya", "biyoloji"];
  const sosyalKeywords = ["sosyal", "tarih", "coğrafya", "felsefe", "din"];

  if (fenKeywords.some((keyword) => a.includes(keyword)) && fenKeywords.some((keyword) => b.includes(keyword))) {
    return true;
  }

  if (
    sosyalKeywords.some((keyword) => a.includes(keyword)) &&
    sosyalKeywords.some((keyword) => b.includes(keyword))
  ) {
    return true;
  }

  return false;
}

function inferCourseFromGain(
  gain: string,
  subjects: Array<SubjectPerformance & { performance: number; total: number }>,
  books: Book[],
  index: number,
) {
  const normalizedGain = normalize(gain);

  for (const [course, keywords] of Object.entries(COURSE_KEYWORDS)) {
    if (keywords.some((keyword) => normalizedGain.includes(normalize(keyword)))) {
      return course;
    }
  }

  const matchedBook = books
    .map((book) => ({ book, score: overlapScore(book.title, gain) + overlapScore(book.topics.join(" "), gain) }))
    .sort((left, right) => right.score - left.score)[0];

  if (matchedBook && matchedBook.score > 0) {
    return matchedBook.book.course;
  }

  if (subjects.length > 0) {
    return subjects[index % subjects.length].course;
  }

  return "Genel Tekrar";
}

function findBestBookAndTopic(gain: string, course: string, grade: string, books: Book[], index: number) {
  const gradeMatched = books.filter((book) => book.grade === grade);
  const candidateBooks = gradeMatched.length > 0 ? gradeMatched : books;
  const courseBooks = candidateBooks.filter((book) => courseMatches(book.course, course));
  const usableBooks = courseBooks.length > 0 ? courseBooks : candidateBooks;

  let bestBook: Book | null = usableBooks[0] ?? null;
  let bestTopic = usableBooks[0]?.topics[0] ?? `${course} tekrar başlığı`;
  let bestScore = -1;

  usableBooks.forEach((book) => {
    book.topics.forEach((topic) => {
      const score = overlapScore(topic, gain) + overlapScore(book.title, gain) + (courseMatches(book.course, course) ? 2 : 0);
      if (score > bestScore) {
        bestBook = book;
        bestTopic = topic;
        bestScore = score;
      }
    });
  });

  if (!bestBook && candidateBooks[index % Math.max(candidateBooks.length, 1)]) {
    const fallbackBook = candidateBooks[index % candidateBooks.length];
    return {
      book: fallbackBook,
      topic: fallbackBook.topics[index % Math.max(fallbackBook.topics.length, 1)] ?? `${course} tekrar başlığı`,
    };
  }

  return {
    book: bestBook,
    topic: bestTopic,
  };
}

function inferAutoGains(subjects: SubjectPerformance[], books: Book[], grade: string, notes: string, examType: string) {
  const ranked = subjects
    .map((subject) => {
      const total = subject.correct + subject.wrong + subject.blank;
      const net = calculateNet(subject);
      const performance = total > 0 ? Math.max(0, net) / total : 0;
      return { ...subject, total, net, performance };
    })
    .sort((left, right) => left.performance - right.performance);

  const noteTokens = tokenize(notes);
  const autoGains = ranked.slice(0, 3).map((subject) => {
    const courseBooks = books.filter((book) => book.grade === grade && courseMatches(book.course, subject.course));
    const preferredBook = courseBooks[0] ?? books.find((book) => courseMatches(book.course, subject.course)) ?? null;
    const bestTopic =
      preferredBook?.topics
        .map((topic) => ({ topic, score: noteTokens.reduce((sum, token) => sum + (normalize(topic).includes(token) ? 1 : 0), 0) }))
        .sort((left, right) => right.score - left.score)[0]?.topic ?? `${subject.course} temel tekrar`;

    const reason =
      subject.blank >= subject.wrong
        ? "boş bıraktığın soruların yoğun olduğu alan"
        : "yanlış oranının yükseldiği alan";

    return `${subject.course} - ${bestTopic} (${reason})`;
  });

  if (autoGains.length > 0) return autoGains;
  return [`${examType} için genel konu taraması ve soru çözümü`];
}

function summarizeAutoAnalysis(resultLike: Pick<ExamResult, "subjects" | "gains" | "notes" | "fileName" | "analysisMode">) {
  const weakSubjects = resultLike.subjects
    .map((subject) => {
      const total = subject.correct + subject.wrong + subject.blank;
      const net = calculateNet(subject);
      const performance = total > 0 ? Math.max(0, net) / total : 0;
      return { course: subject.course, performance };
    })
    .sort((left, right) => left.performance - right.performance)
    .slice(0, 2)
    .map((item) => item.course);

  const sourceText = resultLike.fileName ? "yüklenen dosya + net verisi" : "girilen net verisi";
  const modeText = resultLike.analysisMode === "auto-ai" ? "tam otomatik AI analizi" : "kullanıcı destekli AI analizi";
  const gainText = resultLike.gains.length > 0 ? `${resultLike.gains.length} konu odağı çıkarıldı` : "konu odağı genel performanstan türetildi";
  const weaknessText = weakSubjects.length > 0 ? `öncelikli dersler: ${weakSubjects.join(", ")}` : "öncelikli dersler tespit edilemedi";

  return `${modeText} • kaynak: ${sourceText} • ${gainText} • ${weaknessText}`;
}

function buildStudyPlan(result: ExamResult, books: Book[], aiConfig: AiConfig): StudyPlan {
  const createdAt = new Date().toISOString();
  const performance = result.subjects
    .map((subject) => {
      const total = subject.correct + subject.wrong + subject.blank;
      const net = calculateNet(subject);
      return {
        ...subject,
        total,
        net,
        performance: total > 0 ? Math.max(0, net) / total : 0,
      };
    })
    .sort((left, right) => left.performance - right.performance);

  const gains =
    result.gains.length > 0
      ? result.gains
      : performance.length > 0
        ? performance.map((subject) => `${subject.course} dersinde temel tekrar ve soru çözümü`)
        : ["Genel tekrar ve kazanım güçlendirme"];

  const mappedTopics = gains.map((gain, index) => {
    const course = inferCourseFromGain(gain, performance, books, index);
    const match = findBestBookAndTopic(gain, course, result.grade, books, index);

    return {
      gain,
      course,
      topic: match.topic,
      sourceBook: match.book?.title ?? `${course} için admin kitabı yüklenmeli`,
    };
  });

  const expandedTopics = [...mappedTopics];
  let fallbackIndex = 0;

  while (expandedTopics.length < 10) {
    const weakCourse = performance[fallbackIndex % Math.max(performance.length, 1)]?.course ?? "Genel Tekrar";
    const fallbackMatch = findBestBookAndTopic(weakCourse, weakCourse, result.grade, books, fallbackIndex);

    expandedTopics.push({
      gain: `${weakCourse} için ek konu taraması ve soru çözümü`,
      course: weakCourse,
      topic: fallbackMatch.topic,
      sourceBook: fallbackMatch.book?.title ?? `${weakCourse} için kitap bekleniyor`,
    });

    fallbackIndex += 1;
    if (fallbackIndex > 20) break;
  }

  const startDate = new Date();
  const weekRange = `${formatShortDate(startDate.toISOString())} - ${formatShortDate(addDays(startDate, 6).toISOString())}`;

  const days = DAY_NAMES.map((dayLabel, dayIndex) => {
    const bucket = [expandedTopics[dayIndex], expandedTopics[dayIndex + 7]].filter(Boolean) as MappedTopic[];

    if (bucket.length === 0) {
      bucket.push({
        gain: "Genel tekrar",
        course: "Genel Tekrar",
        topic: "Haftalık tekrar",
        sourceBook: "Admin tarafından yüklenecek kaynak",
      });
    }

    const tasks: DailyTask[] = bucket.map((item, taskIndex) => {
      const weakness = performance.find((subject) => courseMatches(subject.course, item.course));
      const difficultyBoost = weakness ? Math.round((1 - weakness.performance) * 20) : 10;
      const questions = Math.max(18, 20 + difficultyBoost + taskIndex * 6);
      const minutes = Math.max(35, 40 + difficultyBoost + taskIndex * 10);

      return {
        course: item.course,
        topic: item.topic,
        gain: item.gain,
        questions,
        minutes,
        sourceBook: item.sourceBook,
      };
    });

    if (dayIndex === 5) {
      tasks.push({
        course: "Deneme Analizi",
        topic: "Mini deneme + yanlış analizi",
        gain: "Hafta içi çalışılan konuları ölç",
        questions: 30,
        minutes: 60,
        sourceBook: "Yüklediğin son deneme sonucu",
      });
    }

    if (dayIndex === 6) {
      tasks.push({
        course: "Plan Güncelleme",
        topic: "Yeni haftalık plan isteği",
        gain: "7 gün dolduğunda yeni deneme yükle ve planı yenile",
        questions: 15,
        minutes: 35,
        sourceBook: aiConfig.label,
      });
    }

    return {
      dayLabel,
      focus: `${tasks[0]?.course ?? "Genel"} odak günü`,
      totalQuestions: tasks.reduce((sum, task) => sum + task.questions, 0),
      totalMinutes: tasks.reduce((sum, task) => sum + task.minutes, 0),
      tasks,
      completed: false,
    };
  });

  const recommendations = [
    performance[0]
      ? `En zayıf alanın ${performance[0].course}. Haftaya kadar bu derste kısa ama günlük tekrar döngüsü koru.`
      : "Düzenli veri girişi yaptıkça plan daha isabetli hale gelir.",
    performance[1]
      ? `${performance[1].course} dersinde ikinci öncelik olarak soru çözümü yoğunlaştırıldı.`
      : "Yüklediğin kitap sayısı arttıkça konu eşleştirme kalitesi yükselir.",
    "7 gün sonunda yeni bildirim alıp planı güncellemen için tarayıcı bildirimi etkinleştir.",
    `AI akışı, ${aiConfig.apiModel} + ${aiConfig.thinking} mantığına göre hazırlandı. ${aiConfig.backendNote}`,
  ];

  return {
    id: uid(),
    userId: result.userId,
    resultId: result.id,
    createdAt,
    model: aiConfig.apiModel,
    thinking: aiConfig.thinking,
    weekRange,
    recommendations,
    mappedTopics,
    days,
  };
}

function buildClaudePrompt(result: ExamResult, mappedTopics: MappedTopic[], books: Book[], aiConfig: AiConfig) {
  const bookSummary = books
    .slice(0, 6)
    .map((book) => `- ${book.grade} | ${book.course} | ${book.title} | konular: ${book.topics.join(", ")}`)
    .join("\n");

  const subjectSummary = result.subjects
    .map((subject) => `${subject.course}: ${calculateNet(subject).toFixed(2)} net`)
    .join(" | ");

  const gainSummary = result.gains.length > 0 ? result.gains.map((gain) => `- ${gain}`).join("\n") : "- Kullanıcı yalnızca net bilgisi verdi";
  const mappedSummary = mappedTopics.length > 0 ? mappedTopics.map((item) => `- ${item.gain} => ${item.course} / ${item.topic} / ${item.sourceBook}`).join("\n") : "- Henüz eşleşme yok";

  return [
    "Sen bir eğitim koçusun.",
    `AI sağlayıcı: ${aiConfig.providerLabel}`,
    `AI modu: ${aiConfig.apiModel} / ${aiConfig.thinking}`,
    `Öğrenci seviyesi: ${result.grade}`,
    `Deneme tipi: ${result.examType}`,
    `Net özeti: ${subjectSummary}`,
    "Denemede görülen kazanımlar:",
    gainSummary,
    "Kitap envanteri:",
    bookSummary || "- Henüz kitap yüklenmedi",
    "Ön eşleştirilen konu adayları:",
    mappedSummary,
    "Görev:",
    "1) Kazanımları doğru ders ve konuya dönüştür.",
    "2) En zayıf dersleri önceliklendir.",
    "3) Gün-konu-soru sayısı bazlı 7 günlük plan üret.",
    "4) Her gün toplam çalışma süresini ver.",
    "5) Haftanın sonunda yeni deneme yükleme hatırlatması ekle.",
  ].join("\n");
}

function extractJsonBlock(text: string) {
  const match = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (match?.[1]) return match[1].trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text.trim();
}

function extractPuterText(response: unknown) {
  if (typeof response === "string") return response;
  if (!response || typeof response !== "object") return "";

  const maybeMessage = (response as { message?: { content?: Array<{ text?: string }> | { text?: string } } }).message;
  const content = maybeMessage?.content;

  if (Array.isArray(content)) {
    return content.map((item) => item?.text ?? "").join(" ").trim();
  }

  if (content && typeof content === "object" && "text" in content) {
    return (content as { text?: string }).text?.trim?.() ?? "";
  }

  return "";
}

async function callPuterChat(prompt: string, model: string) {
  if (typeof window === "undefined" || !window.puter?.ai?.chat) {
    throw new Error("Puter.js yüklenemedi. Sayfayı yenileyip tekrar dene.");
  }

  const response = await window.puter.ai.chat(prompt, { model });
  return extractPuterText(response);
}

function normalizeAiPlan(input: unknown, fallback: StudyPlan): StudyPlan | null {
  if (!input || typeof input !== "object") return null;
  const parsed = input as {
    recommendations?: unknown;
    mappedTopics?: unknown;
    days?: unknown;
    model?: unknown;
    thinking?: unknown;
  };

  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.map((item) => String(item)).filter(Boolean).slice(0, 8)
    : fallback.recommendations;

  const mappedTopics = Array.isArray(parsed.mappedTopics)
    ? parsed.mappedTopics
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const value = item as Record<string, unknown>;
          return {
            gain: String(value.gain ?? "Genel kazanım"),
            course: String(value.course ?? "Genel Tekrar"),
            topic: String(value.topic ?? "Genel tekrar"),
            sourceBook: String(value.sourceBook ?? "Yüklenen kaynak / önerilen kaynak"),
          } satisfies MappedTopic;
        })
        .filter(Boolean) as MappedTopic[]
    : fallback.mappedTopics;

  const days = Array.isArray(parsed.days)
    ? parsed.days
        .map((day, index) => {
          if (!day || typeof day !== "object") return null;
          const value = day as Record<string, unknown>;
          const tasks = Array.isArray(value.tasks)
            ? value.tasks
                .map((task) => {
                  if (!task || typeof task !== "object") return null;
                  const taskValue = task as Record<string, unknown>;
                  return {
                    course: String(taskValue.course ?? "Genel Tekrar"),
                    topic: String(taskValue.topic ?? "Konu tekrarı"),
                    gain: String(taskValue.gain ?? "Eksik kazanım güçlendirme"),
                    questions: Number(taskValue.questions ?? 20),
                    minutes: Number(taskValue.minutes ?? 40),
                    sourceBook: String(taskValue.sourceBook ?? "Yüklenen kaynak"),
                  } satisfies DailyTask;
                })
                .filter(Boolean) as DailyTask[]
            : fallback.days[index]?.tasks ?? [];

          return {
            dayLabel: String(value.dayLabel ?? DAY_NAMES[index] ?? `Gün ${index + 1}`),
            focus: String(value.focus ?? `${tasks[0]?.course ?? "Genel"} odak günü`),
            tasks,
            totalQuestions: tasks.reduce((sum, task) => sum + (Number.isFinite(task.questions) ? task.questions : 0), 0),
            totalMinutes: tasks.reduce((sum, task) => sum + (Number.isFinite(task.minutes) ? task.minutes : 0), 0),
            completed: false,
          } satisfies DayPlan;
        })
        .filter(Boolean) as DayPlan[]
    : fallback.days;

  if (days.length === 0) return null;

  return {
    ...fallback,
    model: typeof parsed.model === "string" && parsed.model ? parsed.model : fallback.model,
    thinking: typeof parsed.thinking === "string" && parsed.thinking ? parsed.thinking : fallback.thinking,
    recommendations,
    mappedTopics: mappedTopics.length > 0 ? mappedTopics : fallback.mappedTopics,
    days,
  };
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-slate-950/20 backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "violet" | "emerald" | "amber" | "rose" }) {
  const tones = {
    slate: "bg-white/8 text-slate-200 border-white/10",
    violet: "bg-violet-500/15 text-violet-200 border-violet-400/20",
    emerald: "bg-emerald-500/15 text-emerald-200 border-emerald-400/20",
    amber: "bg-amber-500/15 text-amber-100 border-amber-400/20",
    rose: "bg-rose-500/15 text-rose-100 border-rose-400/20",
  } as const;

  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="h-full">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{hint}</p>
    </Card>
  );
}

export default function App() {
  const [users, setUsers] = useState<User[]>(() => readJSON(STORAGE.users, DEFAULT_USERS));
  const [books, setBooks] = useState<Book[]>(() =>
    readJSON(STORAGE.books, DEFAULT_BOOKS).filter((book) => !LEGACY_SEEDED_BOOK_IDS.has(book.id)),
  );
  const [examResults, setExamResults] = useState<ExamResult[]>(() => readJSON(STORAGE.results, []));
  const [studyPlans, setStudyPlans] = useState<StudyPlan[]>(() => readJSON(STORAGE.plans, []));
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => readJSON(STORAGE.currentUserId, null));
  const [aiMode, setAiMode] = useState<AiMode>(() => readJSON(STORAGE.aiMode, DEFAULT_AI_MODE));
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => readJSON(STORAGE.apiSettings, DEFAULT_API_SETTINGS));
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [flashMessage, setFlashMessage] = useState("");
  const [apiTestStatus, setApiTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [apiTestMessage, setApiTestMessage] = useState("");
  const [planGenerationStatus, setPlanGenerationStatus] = useState<"idle" | "loading">("idle");
  const [bookSearch, setBookSearch] = useState("");
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  const [loginForm, setLoginForm] = useState({
    username: "",
    password: "",
  });

  const [registerForm, setRegisterForm] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
  });

  const [examForm, setExamForm] = useState({
    title: "Haftalık Genel Deneme",
    examType: "TYT Genel Deneme",
    grade: "12. Sınıf",
    gainsText: "",
    notes: "",
    fileName: "",
    fileType: "",
  });

  const [subjectForm, setSubjectForm] = useState<SubjectPerformance[]>(DEFAULT_SUBJECTS);

  const [bookForm, setBookForm] = useState({
    title: "",
    grade: "12. Sınıf",
    course: "Matematik",
    publisher: "",
    topicsText: "",
    description: "",
    fileName: "",
  });

  useEffect(() => {
    writeJSON(STORAGE.users, users);
  }, [users]);

  useEffect(() => {
    writeJSON(STORAGE.books, books);
  }, [books]);

  useEffect(() => {
    writeJSON(STORAGE.results, examResults);
  }, [examResults]);

  useEffect(() => {
    writeJSON(STORAGE.plans, studyPlans);
  }, [studyPlans]);

  useEffect(() => {
    writeJSON(STORAGE.currentUserId, currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    writeJSON(STORAGE.aiMode, aiMode);
  }, [aiMode]);

  useEffect(() => {
    writeJSON(STORAGE.apiSettings, apiSettings);
  }, [apiSettings]);

  useEffect(() => {
    if (!flashMessage) return;
    const timeout = window.setTimeout(() => setFlashMessage(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [flashMessage]);

  const currentUser = useMemo(() => users.find((user) => user.id === currentUserId) ?? null, [users, currentUserId]);
  const selectedAiConfig = useMemo(() => AI_CONFIGS[aiMode] ?? AI_CONFIGS[DEFAULT_AI_MODE], [aiMode]);
  const activeApiKey = aiMode === "anthropic" ? apiSettings.anthropicApiKey : aiMode === "openrouter" ? apiSettings.openRouterApiKey : "";
  const activeBaseUrl =
    aiMode === "anthropic"
      ? apiSettings.anthropicBaseUrl
      : aiMode === "openrouter"
        ? apiSettings.openRouterBaseUrl
        : aiMode === "puter"
          ? "https://js.puter.com/v2/"
          : "";
  const activeApiModel = aiMode === "openrouter" ? apiSettings.openRouterModel || selectedAiConfig.apiModel : selectedAiConfig.apiModel;

  const myResults = useMemo(
    () =>
      examResults
        .filter((result) => result.userId === currentUser?.id)
        .map((result) => ({
          ...result,
          analysisMode: result.analysisMode ?? (result.gains?.length ? "manual-assisted" : "auto-ai"),
          analysisSummary:
            result.analysisSummary ??
            summarizeAutoAnalysis({
              subjects: result.subjects,
              gains: result.gains,
              notes: result.notes,
              fileName: result.fileName,
              analysisMode: result.analysisMode ?? (result.gains?.length ? "manual-assisted" : "auto-ai"),
            }),
        }))
        .sort((left, right) => +new Date(right.uploadedAt) - +new Date(left.uploadedAt)),
    [examResults, currentUser],
  );

  const myPlans = useMemo(
    () => studyPlans.filter((plan) => plan.userId === currentUser?.id).sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt)),
    [studyPlans, currentUser],
  );

  const latestResult = myResults[0] ?? null;
  const latestPlan = myPlans[0] ?? null;

  useEffect(() => {
    if (!currentUser && currentUserId) {
      setCurrentUserId(null);
    }
  }, [currentUser, currentUserId]);

  useEffect(() => {
    if (!selectedResultId && latestResult) {
      setSelectedResultId(latestResult.id);
    }
  }, [latestResult, selectedResultId]);

  const selectedResult = useMemo(
    () => myResults.find((result) => result.id === selectedResultId) ?? latestResult,
    [myResults, selectedResultId, latestResult],
  );

  const selectedPlan = useMemo(() => {
    if (!selectedResult) return latestPlan;
    return myPlans.find((plan) => plan.resultId === selectedResult.id) ?? latestPlan;
  }, [myPlans, selectedResult, latestPlan]);

  const reminderDaysLeft = useMemo(() => {
    if (!latestPlan) return null;
    const elapsedDays = Math.floor((Date.now() - +new Date(latestPlan.createdAt)) / (1000 * 60 * 60 * 24));
    return Math.max(0, 7 - elapsedDays);
  }, [latestPlan]);

  const reminderDue = latestPlan ? reminderDaysLeft === 0 : false;

  const consistencyScore = useMemo(() => {
    if (!latestPlan) return 0;
    const completed = latestPlan.days.filter((day) => day.completed).length;
    return Math.round((completed / latestPlan.days.length) * 100);
  }, [latestPlan]);

  const relevantBooks = useMemo(() => {
    if (!selectedResult) return books;
    const matches = books.filter((book) => book.grade === selectedResult.grade || courseMatches(book.course, selectedResult.examType));
    return matches.length > 0 ? matches : books;
  }, [books, selectedResult]);

  const promptPreview = useMemo(() => {
    if (!selectedResult) return "";
    const prompt = buildClaudePrompt(selectedResult, selectedPlan?.mappedTopics ?? [], relevantBooks, selectedAiConfig);

    const payload =
      aiMode === "anthropic"
        ? {
            endpoint: activeBaseUrl,
            headers: {
              "x-api-key": activeApiKey ? "••••••••••" : "<API_KEY_GIRILMEDI>",
              "anthropic-version": apiSettings.anthropicVersion,
              "content-type": "application/json",
            },
            model: activeApiModel,
            max_tokens: 4096,
            thinking: { type: selectedAiConfig.thinking },
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: prompt,
                  },
                ],
              },
            ],
          }
        : aiMode === "openrouter"
          ? {
              endpoint: activeBaseUrl,
              headers: {
                Authorization: activeApiKey ? "Bearer ••••••••••" : "Bearer <API_KEY_GIRILMEDI>",
                "HTTP-Referer": apiSettings.openRouterSiteUrl || "<SITE_URL>",
                "X-OpenRouter-Title": apiSettings.openRouterAppTitle || "DenemeKoçu AI",
                "content-type": "application/json",
              },
              model: activeApiModel,
              max_tokens: 4096,
              messages: [
                {
                  role: "system",
                  content: "Sen bir eğitim koçusun ve sadece yapılandırılmış haftalık çalışma planı üretirsin.",
                },
                {
                  role: "user",
                  content: prompt,
                },
              ],
            }
          : aiMode === "puter"
            ? {
                script: activeBaseUrl,
                sdk: "window.puter.ai.chat",
                model: activeApiModel,
                input: prompt,
                note: "Puter.js tarayıcı içinden ücretsiz Claude akışı sağlar; API key gerekmez.",
              }
            : {
                mode: selectedAiConfig.apiModel,
                prompt,
              };

    return JSON.stringify(payload, null, 2);
  }, [selectedResult, selectedPlan, relevantBooks, selectedAiConfig, apiSettings, aiMode, activeApiKey, activeBaseUrl, activeApiModel]);

  const visibleBooks = useMemo(() => {
    return books.filter((book) => {
      const query = normalize(bookSearch);
      if (!query) return true;
      return normalize(`${book.title} ${book.grade} ${book.course} ${book.publisher} ${book.topics.join(" ")}`).includes(query);
    });
  }, [books, bookSearch]);

  function patchCurrentUser(patch: Partial<User>) {
    if (!currentUser) return;
    setUsers((previous) => previous.map((user) => (user.id === currentUser.id ? { ...user, ...patch } : user)));
  }

  useEffect(() => {
    if (!currentUser || !currentUser.notificationEnabled || !latestPlan) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (!reminderDue) return;

    const today = new Date().toDateString();
    if (currentUser.lastNotificationAt === today) return;

    new Notification("Yeni haftalık plan zamanı", {
      body: "Bir hafta doldu. Yeni deneme sonucunu yükleyip AI destekli yeni program alabilirsin.",
      icon: "/favicon.ico",
    });

    patchCurrentUser({ lastNotificationAt: today });
  }, [currentUser, latestPlan, reminderDue]);

  function resetExamForm() {
    setExamForm({
      title: "Haftalık Genel Deneme",
      examType: "TYT Genel Deneme",
      grade: "12. Sınıf",
      gainsText: "",
      notes: "",
      fileName: "",
      fileType: "",
    });
    setSubjectForm(DEFAULT_SUBJECTS);
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const user = users.find(
      (item) => item.username === loginForm.username.trim() && item.password === loginForm.password,
    );

    if (!user) {
      setFlashMessage("Giriş başarısız. Kullanıcı adı veya şifre yanlış.");
      return;
    }

    setCurrentUserId(user.id);
    setActiveView("dashboard");
    setFlashMessage(`Hoş geldin ${user.fullName}. Panel hazır.`);
    setLoginForm({ username: "", password: "" });
  }

  function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const username = registerForm.username.trim();
    const email = registerForm.email.trim().toLocaleLowerCase("tr-TR");

    if (!registerForm.fullName.trim() || !username || !email || !registerForm.password) {
      setFlashMessage("Lütfen tüm kayıt alanlarını doldur.");
      return;
    }

    const exists = users.some((user) => user.username === username || user.email.toLocaleLowerCase("tr-TR") === email);
    if (exists) {
      setFlashMessage("Bu kullanıcı adı veya e-posta zaten kayıtlı.");
      return;
    }

    const newUser: User = {
      id: uid(),
      fullName: registerForm.fullName.trim(),
      username,
      email,
      password: registerForm.password,
      role: "student",
      createdAt: new Date().toISOString(),
      notificationEnabled: false,
    };

    setUsers((previous) => [newUser, ...previous]);
    setCurrentUserId(newUser.id);
    setActiveView("dashboard");
    setAuthMode("login");
    setRegisterForm({ fullName: "", username: "", email: "", password: "" });
    setFlashMessage("Kayıt tamamlandı. İlk denemeni yükleyerek plan oluşturmaya başlayabilirsin.");
  }

  function handleLogout() {
    setCurrentUserId(null);
    setSelectedResultId(null);
    setActiveView("dashboard");
    setFlashMessage("Oturum kapatıldı.");
  }

  function handleExamFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setExamForm((previous) => ({
      ...previous,
      fileName: file?.name ?? "",
      fileType: file?.type ?? "",
    }));
  }

  function handleBookFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setBookForm((previous) => ({
      ...previous,
      fileName: file?.name ?? "",
    }));
  }

  function updateSubject(course: string, field: "correct" | "wrong" | "blank", value: string) {
    const parsed = Math.max(0, Number(value || 0));
    setSubjectForm((previous) =>
      previous.map((subject) => (subject.course === course ? { ...subject, [field]: parsed } : subject)),
    );
  }

  async function generatePlanForResult(result: ExamResult) {
    setPlanGenerationStatus("loading");

    const fallbackPlan = buildStudyPlan(result, books, {
      ...selectedAiConfig,
      apiModel: activeApiModel,
    });

    const prompt = buildClaudePrompt(result, fallbackPlan.mappedTopics, books, {
      ...selectedAiConfig,
      apiModel: activeApiModel,
    });

    if (aiMode === "puter") {
      try {
        const rawText = await callPuterChat(
          `${prompt}\n\nSadece JSON döndür. JSON şeması: { model, thinking, recommendations: string[], mappedTopics: [{ gain, course, topic, sourceBook }], days: [{ dayLabel, focus, tasks: [{ course, topic, gain, questions, minutes, sourceBook }] }] }. 7 günlük plan üret ve Türkçe yaz.`,
          activeApiModel,
        );
        const parsed = JSON.parse(extractJsonBlock(rawText));
        const normalized = normalizeAiPlan(parsed, fallbackPlan) ?? fallbackPlan;
        setStudyPlans((previous) => [normalized, ...previous]);
        setPlanGenerationStatus("idle");
        return normalized;
      } catch {
        setStudyPlans((previous) => [fallbackPlan, ...previous]);
        setPlanGenerationStatus("idle");
        return fallbackPlan;
      }
    }

    if ((aiMode !== "openrouter" && aiMode !== "anthropic") || !activeApiKey.trim() || !apiSettings.allowBrowserCalls) {
      setStudyPlans((previous) => [fallbackPlan, ...previous]);
      setPlanGenerationStatus("idle");
      return fallbackPlan;
    }

    try {
      const response =
        aiMode === "openrouter"
          ? await fetch(activeBaseUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${activeApiKey.trim()}`,
                "HTTP-Referer": apiSettings.openRouterSiteUrl || window.location.origin,
                "X-OpenRouter-Title": apiSettings.openRouterAppTitle || "DenemeKoçu AI",
              },
              body: JSON.stringify({
                model: activeApiModel,
                response_format: { type: "json_object" },
                messages: [
                  {
                    role: "system",
                    content:
                      "Sen bir eğitim koçususun. Sadece geçerli JSON döndür. JSON şeması: { model, thinking, recommendations: string[], mappedTopics: [{ gain, course, topic, sourceBook }], days: [{ dayLabel, focus, tasks: [{ course, topic, gain, questions, minutes, sourceBook }] }] }",
                  },
                  {
                    role: "user",
                    content: `${prompt}\n\nSadece JSON döndür. 7 gün üret. Türkçe yaz.`,
                  },
                ],
              }),
            })
          : await fetch(activeBaseUrl, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-api-key": activeApiKey.trim(),
                "anthropic-version": apiSettings.anthropicVersion,
                "anthropic-dangerous-direct-browser-access": "true",
              },
              body: JSON.stringify({
                model: activeApiModel,
                max_tokens: 4096,
                messages: [
                  {
                    role: "user",
                    content: `${prompt}\n\nSadece JSON döndür. Şema: { model, thinking, recommendations, mappedTopics, days }`,
                  },
                ],
              }),
            });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      const rawText =
        aiMode === "openrouter"
          ? data?.choices?.[0]?.message?.content?.toString?.() ?? ""
          : Array.isArray(data?.content)
            ? data.content
                .map((item: { type?: string; text?: string }) => (item?.type === "text" ? item.text ?? "" : ""))
                .join(" ")
            : "";

      const parsed = JSON.parse(extractJsonBlock(rawText));
      const normalized = normalizeAiPlan(parsed, fallbackPlan) ?? fallbackPlan;
      setStudyPlans((previous) => [normalized, ...previous]);
      setPlanGenerationStatus("idle");
      return normalized;
    } catch {
      setStudyPlans((previous) => [fallbackPlan, ...previous]);
      setPlanGenerationStatus("idle");
      return fallbackPlan;
    }
  }

  async function handleAddResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser) return;

    const manualGains = examForm.gainsText
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!examForm.title.trim()) {
      setFlashMessage("Deneme başlığı gerekli.");
      return;
    }

    const inferredGains = inferAutoGains(subjectForm, books, examForm.grade, examForm.notes.trim(), examForm.examType);
    const finalGains = manualGains.length > 0 ? manualGains : inferredGains;
    const analysisMode: ExamResult["analysisMode"] = manualGains.length > 0 ? "manual-assisted" : "auto-ai";

    const result: ExamResult = {
      id: uid(),
      userId: currentUser.id,
      title: examForm.title.trim(),
      examType: examForm.examType,
      grade: examForm.grade,
      fileName: examForm.fileName,
      fileType: examForm.fileType,
      uploadedAt: new Date().toISOString(),
      gains: finalGains,
      notes: examForm.notes.trim(),
      subjects: subjectForm,
      analysisMode,
      analysisSummary: summarizeAutoAnalysis({
        subjects: subjectForm,
        gains: finalGains,
        notes: examForm.notes.trim(),
        fileName: examForm.fileName,
        analysisMode,
      }),
    };

    setExamResults((previous) => [result, ...previous]);
    const plan = await generatePlanForResult(result);
    setSelectedResultId(result.id);
    setActiveView("planner");
    resetExamForm();
    setFlashMessage(`Deneme yüklendi, AI otomatik analiz etti ve ${plan.weekRange} haftası için plan oluşturdu.`);
  }

  async function handleGenerateLatestPlan() {
    if (!selectedResult) {
      setFlashMessage("Önce bir deneme sonucu seç veya yükle.");
      return;
    }

    const plan = await generatePlanForResult(selectedResult);
    setActiveView("planner");
    setFlashMessage(`Yeni plan üretildi. Model: ${plan.model}.`);
  }

  function toggleDayComplete(dayLabel: string) {
    if (!selectedPlan) return;

    setStudyPlans((previous) =>
      previous.map((plan) => {
        if (plan.id !== selectedPlan.id) return plan;
        return {
          ...plan,
          days: plan.days.map((day) => (day.dayLabel === dayLabel ? { ...day, completed: !day.completed } : day)),
        };
      }),
    );
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setFlashMessage("Bu tarayıcı bildirim özelliğini desteklemiyor.");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      patchCurrentUser({ notificationEnabled: true });
      setFlashMessage("Bildirimler açıldı. 7 gün dolunca hatırlatma göndereceğim.");
      return;
    }

    patchCurrentUser({ notificationEnabled: false });
    setFlashMessage("Bildirim izni verilmedi.");
  }

  function disableNotifications() {
    patchCurrentUser({ notificationEnabled: false });
    setFlashMessage("Bildirimler kapatıldı.");
  }

  async function testApiConnection() {
    setApiTestStatus("idle");
    setApiTestMessage("");

    if (aiMode !== "anthropic" && aiMode !== "openrouter" && aiMode !== "puter") {
      const message = "Bağlantı testi için önce Puter, Anthropic veya OpenRouter modunu seç.";
      setApiTestStatus("error");
      setApiTestMessage(message);
      setFlashMessage(message);
      return;
    }

    if (aiMode !== "puter" && !activeApiKey.trim()) {
      const message = aiMode === "openrouter" ? "Önce OpenRouter API key gir." : "Önce Anthropic API key gir.";
      setApiTestStatus("error");
      setApiTestMessage(message);
      setFlashMessage(message);
      return;
    }

    if (aiMode !== "puter" && !apiSettings.allowBrowserCalls) {
      const message = "Tarayıcıdan test için önce 'tarayıcıdan doğrudan API çağrısına izin ver' kutusunu aç.";
      setApiTestStatus("error");
      setApiTestMessage(message);
      setFlashMessage(message);
      return;
    }

    setApiTestStatus("loading");
    setApiTestMessage(`${selectedAiConfig.providerLabel} bağlantısı test ediliyor...`);

    try {
      if (aiMode === "puter") {
        const responseText = await callPuterChat("Sadece 'baglanti tamam' yaz.", activeApiModel);
        const message = `Puter bağlantı testi başarılı.${responseText ? ` Model yanıtı: ${responseText}` : ""}`;
        setApiTestStatus("success");
        setApiTestMessage(message);
        setFlashMessage("Puter bağlantı testi başarılı.");
        return;
      }

      const response =
        aiMode === "openrouter"
          ? await fetch(activeBaseUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${activeApiKey.trim()}`,
                "HTTP-Referer": apiSettings.openRouterSiteUrl || window.location.origin,
                "X-OpenRouter-Title": apiSettings.openRouterAppTitle || "DenemeKoçu AI",
              },
              body: JSON.stringify({
                model: activeApiModel,
                max_tokens: 120,
                messages: [
                  {
                    role: "user",
                    content: "Sadece 'baglanti tamam' yaz.",
                  },
                ],
              }),
            })
          : await fetch(activeBaseUrl, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-api-key": activeApiKey.trim(),
                "anthropic-version": apiSettings.anthropicVersion,
                "anthropic-dangerous-direct-browser-access": "true",
              },
              body: JSON.stringify({
                model: activeApiModel,
                max_tokens: 120,
                messages: [
                  {
                    role: "user",
                    content: "Sadece 'baglanti tamam' yaz.",
                  },
                ],
              }),
            });

      if (!response.ok) {
        const errorText = await response.text();
        const provider = aiMode === "openrouter" ? "OpenRouter" : "Anthropic";
        const message = `${provider} bağlantı testi başarısız: ${response.status} ${errorText.slice(0, 280)}`;
        setApiTestStatus("error");
        setApiTestMessage(message);
        setFlashMessage(message);
        return;
      }

      const data = await response.json();
      const responseText = aiMode === "openrouter"
        ? data?.choices?.[0]?.message?.content?.toString?.().trim?.() ?? ""
        : Array.isArray(data?.content)
          ? data.content
              .map((item: { type?: string; text?: string }) => (item?.type === "text" ? item.text ?? "" : ""))
              .join(" ")
              .trim()
          : "";

      const provider = aiMode === "openrouter" ? "OpenRouter" : "Anthropic";
      const message = `${provider} bağlantı testi başarılı.${responseText ? ` Model yanıtı: ${responseText}` : ""}`;
      setApiTestStatus("success");
      setApiTestMessage(message);
      setFlashMessage(`${provider} bağlantı testi başarılı.`);
    } catch (error) {
      const message = `Bağlantı testi çalışmadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`;
      setApiTestStatus("error");
      setApiTestMessage(message);
      setFlashMessage(message);
    }
  }

  function handleAddBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser) return;

    const topics = bookForm.topicsText
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!bookForm.title.trim() || !bookForm.publisher.trim() || topics.length === 0) {
      setFlashMessage("Kitap yüklemek için başlık, yayınevi ve en az bir konu gir.");
      return;
    }

    const book: Book = {
      id: uid(),
      title: bookForm.title.trim(),
      grade: bookForm.grade,
      course: bookForm.course,
      publisher: bookForm.publisher.trim(),
      topics,
      description: bookForm.description.trim(),
      uploadedBy: currentUser.id,
      uploadedAt: new Date().toISOString(),
      fileName: bookForm.fileName,
    };

    setBooks((previous) => [book, ...previous]);
    setBookForm({
      title: "",
      grade: "12. Sınıf",
      course: "Matematik",
      publisher: "",
      topicsText: "",
      description: "",
      fileName: "",
    });
    setActiveView("books");
    setFlashMessage("Kitap envantere eklendi. AI eşleştirmelerinde kullanılacak.");
  }

  const navItems: Array<{ value: View; label: string }> = [
    { value: "dashboard", label: "Panel" },
    { value: "results", label: "Deneme Sonuçları" },
    { value: "planner", label: "Haftalık Plan" },
    { value: "books", label: "Kitaplık" },
    ...(currentUser?.role === "admin" ? [{ value: "admin" as View, label: "Admin" }] : []),
  ];

  if (!currentUser) {
    return (
      <div className="min-h-screen overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.35),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.28),transparent_30%),linear-gradient(180deg,#020617_0%,#0f172a_100%)]" />
        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-10 lg:px-8">
          {flashMessage ? (
            <div className="mb-6 rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
              {flashMessage}
            </div>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-[1.25fr_0.9fr] lg:items-center">
            <div className="space-y-8">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone="violet">AI destekli deneme koçu</Badge>
                  <Badge tone="emerald">Kayıt / giriş / admin</Badge>
                  <Badge tone="amber">Haftalık bildirim sistemi</Badge>
                </div>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                  Deneme sonucunu yükle, <span className="text-violet-300">yapay zekâ analiz etsin</span>, sana haftalık ders programı çıkarsın.
                </h1>
                <p className="max-w-3xl text-lg leading-8 text-slate-300">
                  Bu arayüz; ekran görüntüsü/PDF deneme yükleme, kazanım-konu eşleştirme, admin kitap yönetimi, yerel kayıt ol-giriş yap sistemi,
                  haftalık istikrar takibi ve 7 gün sonunda yeni plan alma hatırlatmasını tek panelde toplar.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <p className="text-lg font-semibold">1. Sonucunu at</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Deneme ekran görüntüsü veya PDF yükle. Netleri girmen faydalı olur ama kazanımları tek tek yazman gerekmez; gerisini AI üstlensin.
                  </p>
                </Card>
                <Card>
                  <p className="text-lg font-semibold">2. AI otomatik analiz etsin</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Zayıf dersleri, olası kazanımları ve öncelikli konu açıklarını otomatik tespit etsin.
                  </p>
                </Card>
                <Card>
                  <p className="text-lg font-semibold">3. Kitaplardan konu bulsun</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Adminin yüklediği kitapları tarayıp doğru sınıf, ders ve konu eşleşmesini kursun.
                  </p>
                </Card>
                <Card>
                  <p className="text-lg font-semibold">4. Haftalık planı yazsın</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Konu-soru-gün bazlı 7 günlük programı oluştursun ve hafta sonunda yenilemeni hatırlatsın.
                  </p>
                </Card>
              </div>

              <Card className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">AI motoru</p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">Puter, OpenRouter ve Anthropic entegrasyonuna hazır çalışma akışı</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    İstersen Puter üzerinden <strong>{AI_CONFIGS.puter.apiModel}</strong> ile ücretsiz Claude akışını deneyebilir, istersen <strong>{AI_CONFIGS.openrouter.apiModel}</strong>
                    ile OpenRouter üstünden yönlenebilir veya ücretli Anthropic kullanımına geçebilirsin. Thinking bilgisi seçili moda göre birlikte gösterilir.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 font-mono text-xs leading-6 text-slate-300">
                  <p>mode: "{selectedAiConfig.id}"</p>
                  <p>model: "{selectedAiConfig.apiModel}"</p>
                  <p>thinking: {`{ type: "${selectedAiConfig.thinking}" }`}</p>
                  <p>input: deneme sonucu + kazanımlar + kitap envanteri</p>
                  <p>output: 7 günlük konu / soru / gün planı</p>
                  <p className="mt-3 text-amber-200">Not: Gerçek API anahtarı güvenli backend tarafında kullanılmalıdır.</p>
                </div>
              </Card>
            </div>

            <Card className="border-white/15 bg-slate-900/80 p-0">
              <div className="border-b border-white/10 p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-400">Hesabına başla</p>
                    <h2 className="mt-1 text-2xl font-semibold text-white">Kayıt ol / giriş yap</h2>
                  </div>
                  <Badge tone="violet">Yerel demo kimlik sistemi</Badge>
                </div>
              </div>

              <div className="space-y-6 p-6">
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1">
                  <button
                    className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
                      authMode === "login" ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/5"
                    }`}
                    onClick={() => setAuthMode("login")}
                    type="button"
                  >
                    Giriş Yap
                  </button>
                  <button
                    className={`rounded-xl px-4 py-3 text-sm font-medium transition ${
                      authMode === "register" ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/5"
                    }`}
                    onClick={() => setAuthMode("register")}
                    type="button"
                  >
                    Kayıt Ol
                  </button>
                </div>

                {authMode === "login" ? (
                  <form className="space-y-4" onSubmit={handleLogin}>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-300">Kullanıcı adı</label>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none ring-0 transition placeholder:text-slate-500 focus:border-violet-400/40"
                        value={loginForm.username}
                        onChange={(event) => setLoginForm((previous) => ({ ...previous, username: event.target.value }))}
                        placeholder="kullaniciadi"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-300">Şifre</label>
                      <input
                        type="password"
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                        value={loginForm.password}
                        onChange={(event) => setLoginForm((previous) => ({ ...previous, password: event.target.value }))}
                        placeholder="••••••••"
                      />
                    </div>
                    <button className="w-full rounded-2xl bg-violet-500 px-4 py-3 font-semibold text-white transition hover:bg-violet-400">
                      Giriş Yap
                    </button>
                  </form>
                ) : (
                  <form className="space-y-4" onSubmit={handleRegister}>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-300">Ad soyad</label>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                        value={registerForm.fullName}
                        onChange={(event) => setRegisterForm((previous) => ({ ...previous, fullName: event.target.value }))}
                        placeholder="Ad Soyad"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300">Kullanıcı adı</label>
                        <input
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                          value={registerForm.username}
                          onChange={(event) => setRegisterForm((previous) => ({ ...previous, username: event.target.value }))}
                          placeholder="ogrenci01"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300">E-posta</label>
                        <input
                          type="email"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                          value={registerForm.email}
                          onChange={(event) => setRegisterForm((previous) => ({ ...previous, email: event.target.value }))}
                          placeholder="ornek@mail.com"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-300">Şifre</label>
                      <input
                        type="password"
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                        value={registerForm.password}
                        onChange={(event) => setRegisterForm((previous) => ({ ...previous, password: event.target.value }))}
                        placeholder="Güçlü bir şifre oluştur"
                      />
                    </div>
                    <button className="w-full rounded-2xl bg-white px-4 py-3 font-semibold text-slate-950 transition hover:bg-slate-100">
                      Hesap Oluştur
                    </button>
                  </form>
                )}

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-emerald-100">Hazır admin hesabı</p>
                      <p className="mt-1 text-sm text-emerald-50/90">Kitap yükleme ve kullanıcı takibi için admin hesabı tanımlıdır; güvenlik nedeniyle bilgiler arayüzde gösterilmez.</p>
                    </div>
                    <Badge tone="emerald">Admin</Badge>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50">
                  Kısa cevap: Resmî Anthropic API ücretsiz değildir. Ama artık Puter ile ücretsiz Claude akışını deneyebilir; istersen OpenRouter, yerel planlayıcı ve demo AI
                  modları arasında geçiş yapabilirsin.
                </div>

                <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm leading-6 text-sky-50">
                  Yayın notu: Bu sürüm Vercel dağıtımı için hazırlandı. Giriş sistemi ve bazı veriler demoda tarayıcı belleğinde tutulur. Gerçek kullanıcı verileriyle canlıya çıkmadan önce backend,
                  gizlilik politikası ve güvenli kimlik doğrulama eklenmelidir.
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.18),transparent_30%),linear-gradient(180deg,#020617_0%,#0f172a_100%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-white">DenemeKoçu AI</h1>
                <Badge tone="violet">{selectedAiConfig.apiModel}</Badge>
                <Badge tone={currentUser.role === "admin" ? "emerald" : "slate"}>{currentUser.role === "admin" ? "Admin" : "Öğrenci"}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-300">
                {currentUser.fullName} olarak giriş yaptın. Deneme sonucu yükle, AI analiz etsin, haftalık programını güncellesin.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                Bildirim: <span className="font-medium text-white">{currentUser.notificationEnabled ? "Açık" : "Kapalı"}</span>
              </div>
              <button
                type="button"
                onClick={currentUser.notificationEnabled ? disableNotifications : enableNotifications}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                {currentUser.notificationEnabled ? "Bildirimi Kapat" : "Bildirim Aç"}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                Çıkış Yap
              </button>
            </div>
          </div>
        </header>

        {flashMessage ? (
          <div className="mb-6 rounded-2xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">{flashMessage}</div>
        ) : null}

        {reminderDue ? (
          <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-50">
            7 günlük plan süren doldu. Yeni deneme sonucunu yükleyip yeni haftalık çalışma programı alman gerekiyor.
          </div>
        ) : null}

        <div className="mb-6 flex flex-wrap gap-3">
          {navItems.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setActiveView(item.value)}
              className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
                activeView === item.value ? "bg-white text-slate-950" : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Yüklenen deneme" value={String(myResults.length)} hint="Her yüklemede yeni analiz oluşturabilirsin" />
              <StatCard label="Haftalık plan" value={String(myPlans.length)} hint="En güncel plan üstte tutulur" />
              <StatCard label="İstikrar skoru" value={`%${consistencyScore}`} hint="Tamamlanan gün kartlarına göre hesaplanır" />
              <StatCard
                label="Plan yenileme"
                value={latestPlan ? (reminderDue ? "Bugün" : `${reminderDaysLeft} gün`) : "-"}
                hint="7 gün sonunda yeni plan önerilir"
              />
            </div>

              <Card>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-400">AI yapılandırması</p>
                    <h2 className="mt-1 text-xl font-semibold">Ücretsiz veya Claude modu seç</h2>
                  </div>
                  <Badge tone="violet">{selectedAiConfig.thinking}</Badge>
                </div>
                <div className="mt-4 space-y-4 text-sm text-slate-300">
                  <p>
                    Seçili AI modu: <strong className="text-white">{selectedAiConfig.apiModel}</strong>
                  </p>
                  <p>{selectedAiConfig.description}</p>
                  <div className="grid gap-2">
                    {(Object.values(AI_CONFIGS) as AiConfig[]).map((config) => (
                      <button
                        key={config.id}
                        type="button"
                        onClick={() => setAiMode(config.id)}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          aiMode === config.id
                            ? "border-violet-400/40 bg-violet-500/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-white">{config.label}</p>
                            <p className="mt-1 text-xs text-slate-400">{config.providerLabel} • {config.apiModel}</p>
                          </div>
                          <div className="flex gap-2">
                            <Badge tone={config.costLabel === "Ücretsiz" ? "emerald" : "amber"}>{config.costLabel}</Badge>
                            {aiMode === config.id ? <Badge tone="violet">Aktif</Badge> : null}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">API ayarları</p>
                        <p className="mt-1 text-sm text-slate-300">
                          Puter modunda API key gerekmez. OpenRouter veya Anthropic kullanacaksan ilgili anahtarı aşağıya gir. Test için ilgili mod seçili olmalı; OpenRouter ve
                          Anthropic'te tarayıcı çağrısı kutusu da açık olmalı.
                        </p>
                      </div>
                      <Badge tone={aiMode === "puter" || activeApiKey ? "emerald" : "amber"}>
                        {aiMode === "puter" ? "API key gerekmez" : activeApiKey ? "API key girildi" : "API key yok"}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <label className="space-y-2 text-sm text-slate-300">
                        <span>OpenRouter API Key</span>
                        <input
                          type="password"
                          value={apiSettings.openRouterApiKey}
                          onChange={(event) => setApiSettings((previous) => ({ ...previous, openRouterApiKey: event.target.value }))}
                          placeholder="sk-or-v1-..."
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                        />
                      </label>

                      <label className="space-y-2 text-sm text-slate-300">
                        <span>OpenRouter API URL</span>
                        <input
                          value={apiSettings.openRouterBaseUrl}
                          onChange={(event) => setApiSettings((previous) => ({ ...previous, openRouterBaseUrl: event.target.value }))}
                          placeholder="https://openrouter.ai/api/v1/chat/completions"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                        />
                      </label>

                      <label className="space-y-2 text-sm text-slate-300">
                        <span>OpenRouter Model</span>
                        <input
                          value={apiSettings.openRouterModel}
                          onChange={(event) => setApiSettings((previous) => ({ ...previous, openRouterModel: event.target.value }))}
                          placeholder="openrouter/free"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                        />
                      </label>

                      <label className="space-y-2 text-sm text-slate-300">
                        <span>OpenRouter Site URL</span>
                        <input
                          value={apiSettings.openRouterSiteUrl}
                          onChange={(event) => setApiSettings((previous) => ({ ...previous, openRouterSiteUrl: event.target.value }))}
                          placeholder="https://seninsiten.com"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                        />
                      </label>

                      <label className="space-y-2 text-sm text-slate-300">
                        <span>OpenRouter App Title</span>
                        <input
                          value={apiSettings.openRouterAppTitle}
                          onChange={(event) => setApiSettings((previous) => ({ ...previous, openRouterAppTitle: event.target.value }))}
                          placeholder="DenemeKoçu AI"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                        />
                      </label>

                      <details className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                        <summary className="cursor-pointer font-medium text-white">Anthropic gelişmiş ayarları</summary>
                        <div className="mt-4 grid gap-3">
                          <label className="space-y-2 text-sm text-slate-300">
                            <span>Anthropic API Key</span>
                            <input
                              type="password"
                              value={apiSettings.anthropicApiKey}
                              onChange={(event) => setApiSettings((previous) => ({ ...previous, anthropicApiKey: event.target.value }))}
                              placeholder="sk-ant-..."
                              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                            />
                          </label>
                          <label className="space-y-2 text-sm text-slate-300">
                            <span>Anthropic Messages API URL</span>
                            <input
                              value={apiSettings.anthropicBaseUrl}
                              onChange={(event) => setApiSettings((previous) => ({ ...previous, anthropicBaseUrl: event.target.value }))}
                              placeholder="https://api.anthropic.com/v1/messages"
                              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                            />
                          </label>
                          <label className="space-y-2 text-sm text-slate-300">
                            <span>Anthropic-Version</span>
                            <input
                              value={apiSettings.anthropicVersion}
                              onChange={(event) => setApiSettings((previous) => ({ ...previous, anthropicVersion: event.target.value }))}
                              placeholder="2023-06-01"
                              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 outline-none transition placeholder:text-slate-500 focus:border-violet-400/40"
                            />
                          </label>
                        </div>
                      </details>

                      <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={apiSettings.allowBrowserCalls}
                          onChange={(event) => setApiSettings((previous) => ({ ...previous, allowBrowserCalls: event.target.checked }))}
                          className="mt-1"
                        />
                        <span>
                          Geliştirme amacıyla tarayıcıdan doğrudan API çağrısına izin ver. <strong className="text-amber-200">Güvenli değildir</strong>; production için backend kullan.
                        </span>
                      </label>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={testApiConnection}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={apiTestStatus === "loading"}
                      >
                        {apiTestStatus === "loading" ? "Bağlantı test ediliyor..." : `${selectedAiConfig.providerLabel} Bağlantısını Test Et`}
                      </button>
                      {aiMode === "puter" ? <Badge tone="emerald">Key gerektirmez</Badge> : null}
                    </div>
                    {apiTestMessage ? (
                      <div
                        className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                          apiTestStatus === "success"
                            ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-50"
                            : apiTestStatus === "error"
                              ? "border-rose-400/20 bg-rose-500/10 text-rose-50"
                              : "border-violet-400/20 bg-violet-500/10 text-violet-50"
                        }`}
                      >
                        {apiTestMessage}
                      </div>
                    ) : null}
                    <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-50">
                      {aiMode === "puter"
                        ? "Puter modunda API key saklamazsın; ancak üçüncü taraf servis kullanım koşulları ve veri gizliliğini yine değerlendirmelisin."
                        : "API key şu anda sadece bu tarayıcıda localStorage içinde saklanır. Canlıya çıkarken anahtarı frontend'e gömmemelisin."}
                    </p>
                  </div>
                  {aiMode === "puter" ? (
                    <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-50">
                      Puter modunda ücretsiz Claude akışı için API key gerekmez. Eğer ilk denemede yanıt alamazsan sayfayı yenileyip bağlantı testini tekrar çalıştır.
                    </p>
                  ) : null}
                  {aiMode === "openrouter" && !apiSettings.openRouterApiKey ? (
                    <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-50">
                      OpenRouter modunu seçtin ama henüz API key girmedin. Yukarıdaki “OpenRouter API Key” alanına anahtarını yazmalısın.
                    </p>
                  ) : null}
                  {aiMode === "anthropic" && !apiSettings.anthropicApiKey ? (
                    <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-50">
                      Claude modunu seçtin ama henüz API key girmedin. Gelişmiş ayarlardaki “Anthropic API Key” alanına anahtarını yazmalısın.
                    </p>
                  ) : null}
                  <p className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
                    {selectedAiConfig.backendNote}
                  </p>
                </div>
              </Card>

            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">Hızlı özet</p>
                  <h2 className="mt-1 text-xl font-semibold">Son durum</h2>
                </div>
                <Badge tone={currentUser.notificationEnabled ? "emerald" : "amber"}>
                  {currentUser.notificationEnabled ? "Bildirim açık" : "Bildirim kapalı"}
                </Badge>
              </div>
              <div className="mt-5 space-y-4 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span>Son deneme</span>
                  <span className="font-medium text-white">{latestResult ? latestResult.title : "Henüz yüklenmedi"}</span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span>Son plan aralığı</span>
                  <span className="font-medium text-white">{latestPlan ? latestPlan.weekRange : "Henüz oluşturulmadı"}</span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span>Kitap envanteri</span>
                  <span className="font-medium text-white">{books.length} kaynak</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            {activeView === "dashboard" ? (
              <>
                <Card>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Kontrol merkezi</p>
                      <h2 className="mt-1 text-2xl font-semibold text-white">Haftalık çalışma panelin</h2>
<p className="mt-2 text-sm leading-6 text-slate-300">
                         Burada sen sadece deneme sonucunu yüklersin; AI analiz, konu eşleştirme, kaynak seçimi ve haftalık planlamayı otomatik üstlenir.
                       </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView("results")}
                      className="rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
                    >
                      Yeni Deneme Yükle
                    </button>
                  </div>
                </Card>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold">Son deneme performansı</h3>
                      <Badge tone="slate">Net bazlı</Badge>
                    </div>
                    <div className="mt-5 space-y-3">
                      {latestResult ? (
                        latestResult.subjects.map((subject) => {
                          const net = calculateNet(subject);
                          const total = subject.correct + subject.wrong + subject.blank;
                          const ratio = total > 0 ? Math.max(0, net) / total : 0;
                          return (
                            <div key={subject.course} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <p className="font-medium text-white">{subject.course}</p>
                                <p className="text-sm text-slate-300">{net.toFixed(2)} net</p>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
                              </div>
                              <p className="mt-2 text-xs text-slate-400">
                                D: {subject.correct} • Y: {subject.wrong} • B: {subject.blank}
                              </p>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-slate-300">Henüz deneme yüklemedin.</p>
                      )}
                    </div>
                  </Card>

                  <Card>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold">Son öneriler</h3>
                      <Badge tone="amber">AI ipuçları</Badge>
                    </div>
                    <div className="mt-5 space-y-3">
                      {latestPlan ? (
                        latestPlan.recommendations.map((item) => (
                          <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
                            {item}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-300">Plan oluşturulduğunda öneriler burada görünecek.</p>
                      )}
                    </div>
                  </Card>
                </div>

                <Card>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">Son aktiviteler</h3>
                    <Badge tone="slate">Geçmiş</Badge>
                  </div>
                  <div className="mt-5 space-y-3">
                    {myResults.length > 0 ? (
                      myResults.slice(0, 4).map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => {
                            setSelectedResultId(result.id);
                            setActiveView("planner");
                          }}
                          className="flex w-full flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <p className="font-medium text-white">{result.title}</p>
                            <p className="mt-1 text-sm text-slate-400">
                              {result.examType} • {result.grade} • {formatDate(result.uploadedAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {result.fileName ? <Badge tone="emerald">{result.fileName}</Badge> : <Badge tone="slate">Dosya adı yok</Badge>}
                            <Badge tone="violet">{result.gains.length} kazanım</Badge>
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-slate-300">Henüz aktivite yok. İlk denemeyi yükleyerek başla.</p>
                    )}
                  </div>
                </Card>
              </>
            ) : null}

            {activeView === "results" ? (
              <>
                <Card>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Yeni deneme kaydı</p>
                      <h2 className="mt-1 text-2xl font-semibold text-white">Deneme sonucunu yükle, AI planı otomatik oluştursun</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        Sen sadece sonucu yükle. İstersen netleri de girersin; ama kazanım, konu ve yanlış başlıkları manuel yazman gerekmez. AI bunları otomatik çıkarıp haftalık planı üretir.
                        Seçili mod Puter ise bu akış ücretsiz Claude desteğiyle tarayıcı içinden de çalışabilir.
                      </p>
                    </div>
                    <Badge tone="emerald">Otomatik plan üretimi aktif</Badge>
                  </div>

                  <form className="mt-6 space-y-5" onSubmit={handleAddResult}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300">Deneme başlığı</label>
                        <input
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400/40"
                          value={examForm.title}
                          onChange={(event) => setExamForm((previous) => ({ ...previous, title: event.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300">Deneme tipi</label>
                        <select
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400/40"
                          value={examForm.examType}
                          onChange={(event) => setExamForm((previous) => ({ ...previous, examType: event.target.value }))}
                        >
                          <option>TYT Genel Deneme</option>
                          <option>AYT Genel Deneme</option>
                          <option>MSÜ Denemesi</option>
                          <option>LGS Denemesi</option>
                          <option>Okul Yazılı Hazırlık</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300">Sınıf seviyesi</label>
                        <select
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400/40"
                          value={examForm.grade}
                          onChange={(event) => setExamForm((previous) => ({ ...previous, grade: event.target.value }))}
                        >
                          <option>8. Sınıf</option>
                          <option>9. Sınıf</option>
                          <option>10. Sınıf</option>
                          <option>11. Sınıf</option>
                          <option>12. Sınıf</option>
                          <option>Mezun</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300">Dosya yükle</label>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={handleExamFile}
                          className="block w-full rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-white file:px-4 file:py-2 file:font-medium file:text-slate-950"
                        />
                        <p className="text-xs text-slate-400">Seçilen dosya: {examForm.fileName || "Henüz dosya seçilmedi"}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm text-slate-300">İstersen ek not / başlık yaz (tamamen opsiyonel)</label>
                      <textarea
                        rows={5}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400/40"
                        value={examForm.gainsText}
                        onChange={(event) => setExamForm((previous) => ({ ...previous, gainsText: event.target.value }))}
                        placeholder="Boş bırakabilirsin. AI ekran görüntüsü/PDF bilgisi, netler ve bağlam notundan konu açıklarını otomatik çıkarsın."
                      />
                      <p className="text-xs text-slate-400">Bu alanı doldurmak zorunda değilsin. İstersen tamamen boş bırak; sistem ana akışta sonucu ve netleri baz alır.</p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-slate-300">Ders bazlı net bilgileri</label>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        {subjectForm.map((subject) => (
                          <div key={subject.course} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="mb-3 font-medium text-white">{subject.course}</p>
                            <div className="grid grid-cols-3 gap-3">
                              <label className="space-y-2 text-xs text-slate-400">
                                <span>Doğru</span>
                                <input
                                  type="number"
                                  min={0}
                                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none"
                                  value={subject.correct}
                                  onChange={(event) => updateSubject(subject.course, "correct", event.target.value)}
                                />
                              </label>
                              <label className="space-y-2 text-xs text-slate-400">
                                <span>Yanlış</span>
                                <input
                                  type="number"
                                  min={0}
                                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none"
                                  value={subject.wrong}
                                  onChange={(event) => updateSubject(subject.course, "wrong", event.target.value)}
                                />
                              </label>
                              <label className="space-y-2 text-xs text-slate-400">
                                <span>Boş</span>
                                <input
                                  type="number"
                                  min={0}
                                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none"
                                  value={subject.blank}
                                  onChange={(event) => updateSubject(subject.course, "blank", event.target.value)}
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm text-slate-300">AI için ek bağlam (opsiyonel)</label>
                      <textarea
                        rows={4}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400/40"
                        value={examForm.notes}
                        onChange={(event) => setExamForm((previous) => ({ ...previous, notes: event.target.value }))}
                        placeholder="Örn. süre yetişmedi, paragraf uzun sürdü, elektrik konusunda eksiğim var..."
                      />
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row">
                      <button
                        className="rounded-2xl bg-violet-500 px-5 py-3 font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={planGenerationStatus === "loading"}
                      >
                        {planGenerationStatus === "loading" ? "AI planı hazırlanıyor..." : "Sonucu Yükle ve AI Planı Otomatik Oluştursun"}
                      </button>
                      <button
                        type="button"
                        onClick={resetExamForm}
                        className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-medium text-white transition hover:bg-white/10"
                      >
                        Formu Sıfırla
                      </button>
                    </div>
                  </form>
                </Card>

                <Card>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">Yüklenen denemeler</h3>
                    <Badge tone="slate">{myResults.length} kayıt</Badge>
                  </div>
                  <div className="mt-5 space-y-3">
                    {myResults.length > 0 ? (
                      myResults.map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => setSelectedResultId(result.id)}
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            selectedResultId === result.id ? "border-violet-400/40 bg-violet-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                          }`}
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="font-medium text-white">{result.title}</p>
                              <p className="mt-1 text-sm text-slate-400">
                                {result.examType} • {result.grade} • {formatDate(result.uploadedAt)}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge tone="violet">{result.gains.length} konu odağı</Badge>
                              <Badge tone="emerald">{result.fileName || "Dosya adı yok"}</Badge>
                              <Badge tone={(result.analysisMode ?? "manual-assisted") === "auto-ai" ? "amber" : "slate"}>
                                {(result.analysisMode ?? "manual-assisted") === "auto-ai" ? "AI otomatik analiz" : "Kullanıcı destekli analiz"}
                              </Badge>
                            </div>
                          </div>
                          <p className="mt-3 text-xs leading-5 text-slate-400">{result.analysisSummary || "AI analiz özeti bu kayıt için henüz oluşturulmadı."}</p>
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-slate-300">Henüz deneme sonucu eklenmedi.</p>
                    )}
                  </div>
                </Card>
              </>
            ) : null}

            {activeView === "planner" ? (
              <>
                <Card>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-slate-400">AI tarafından otomatik oluşturulan plan</p>
                      <h2 className="mt-1 text-2xl font-semibold text-white">7 günlük ders programın</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        Yüklediğin deneme sonucu; AI tarafından analiz, konu eşleştirme, kaynak seçimi ve soru dağılımına dönüştürülerek burada otomatik listelenir.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleGenerateLatestPlan}
                        className="rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={planGenerationStatus === "loading"}
                      >
                        {planGenerationStatus === "loading" ? "AI planı güncelleniyor..." : "AI Analizini Yenile ve Planı Güncelle"}
                      </button>
                      <Badge tone="emerald">{selectedPlan ? selectedPlan.weekRange : "Plan bekleniyor"}</Badge>
                    </div>
                  </div>
                </Card>

                {selectedResult && selectedPlan ? (
                  <>
                    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                      <Card>
                        <h3 className="text-lg font-semibold">Analiz özeti</h3>
                        <div className="mt-5 space-y-3 text-sm text-slate-300">
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Seçili deneme</p>
                            <p className="mt-2 font-medium text-white">{selectedResult.title}</p>
                            <p className="mt-1 text-slate-400">
                              {selectedResult.examType} • {selectedResult.grade} • {formatDate(selectedResult.uploadedAt)}
                            </p>
                            <p className="mt-3 text-xs leading-5 text-slate-400">{selectedResult.analysisSummary || "Bu deneme için AI analiz özeti henüz kaydedilmedi."}</p>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">AI modeli</p>
                            <p className="mt-2 font-medium text-white">{selectedPlan.model}</p>
                            <p className="mt-1 text-slate-400">thinking modu: {selectedPlan.thinking}</p>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Kazanım eşleşmeleri</p>
                            <div className="mt-3 space-y-3">
                              {selectedPlan.mappedTopics.slice(0, 6).map((item) => (
                                <div key={`${item.gain}-${item.topic}`} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                                  <p className="font-medium text-white">{item.topic}</p>
                                  <p className="mt-1 text-xs text-slate-400">{item.course}</p>
                                  <p className="mt-2 text-sm text-slate-300">{item.gain}</p>
                                  <p className="mt-2 text-xs text-emerald-200">Kaynak: {item.sourceBook}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </Card>

                      <Card>
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-lg font-semibold">AI analiz isteği önizlemesi</h3>
                          <div className="flex flex-wrap gap-2">
                            <Badge tone="violet">Backend ready</Badge>
                            <Badge tone={activeApiKey ? "emerald" : "amber"}>{activeApiKey ? "API key kayıtlı" : "API key bekleniyor"}</Badge>
                          </div>
                        </div>
                        <pre className="mt-5 max-h-[30rem] overflow-auto rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-xs leading-6 text-slate-300">
                          {promptPreview}
                        </pre>
                      </Card>
                    </div>

                    <Card>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold">Gün bazlı haftalık plan</h3>
                        <Badge tone="amber">Konu • soru • gün</Badge>
                      </div>
                      <div className="mt-5 grid gap-4 xl:grid-cols-2">
                        {selectedPlan.days.map((day) => (
                          <div key={day.dayLabel} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="text-sm text-slate-400">{day.focus}</p>
                                <h4 className="mt-1 text-xl font-semibold text-white">{day.dayLabel}</h4>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleDayComplete(day.dayLabel)}
                                className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                                  day.completed ? "bg-emerald-500 text-white" : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                                }`}
                              >
                                {day.completed ? "Tamamlandı" : "Günü tamamla"}
                              </button>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <Badge tone="slate">{day.totalQuestions} soru</Badge>
                              <Badge tone="slate">{day.totalMinutes} dakika</Badge>
                            </div>

                            <div className="mt-5 space-y-3">
                              {day.tasks.map((task) => (
                                <div key={`${day.dayLabel}-${task.topic}-${task.course}`} className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <p className="font-medium text-white">{task.course} • {task.topic}</p>
                                      <p className="mt-1 text-sm text-slate-400">{task.gain}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Badge tone="violet">{task.questions} soru</Badge>
                                      <Badge tone="emerald">{task.minutes} dk</Badge>
                                    </div>
                                  </div>
                                  <p className="mt-3 text-xs text-emerald-200">Kaynak: {task.sourceBook}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </>
                ) : (
                  <Card>
                    <p className="text-sm text-slate-300">Henüz plan yok. Deneme sonucu yüklediğinde otomatik olarak plan oluşturulacak.</p>
                  </Card>
                )}
              </>
            ) : null}

            {activeView === "books" ? (
              <>
                <Card>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Kaynak havuzu</p>
                      <h2 className="mt-1 text-2xl font-semibold text-white">Kitaplık ve konu havuzu</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        AI, bu kitapların konu başlıklarını kullanarak denemedeki kazanımları çalışma planına dönüştürür.
                      </p>
                    </div>
                    <input
                      value={bookSearch}
                      onChange={(event) => setBookSearch(event.target.value)}
                      placeholder="Kitap, ders veya konu ara"
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-violet-400/40 md:max-w-xs"
                    />
                  </div>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  {visibleBooks.map((book) => (
                    <Card key={book.id} className="h-full">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-400">{book.grade} • {book.course}</p>
                          <h3 className="mt-1 text-lg font-semibold text-white">{book.title}</h3>
                          <p className="mt-2 text-sm text-slate-300">{book.publisher}</p>
                        </div>
                        <Badge tone="emerald">{book.fileName || "Dosya yok"}</Badge>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-300">{book.description || "Açıklama girilmedi."}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {book.topics.map((topic) => (
                          <span key={`${book.id}-${topic}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                            {topic}
                          </span>
                        ))}
                      </div>
                      <p className="mt-4 text-xs text-slate-500">Yüklenme: {formatDate(book.uploadedAt)}</p>
                    </Card>
                  ))}
                </div>

                {visibleBooks.length === 0 ? (
                  <Card>
                    <p className="text-sm text-slate-300">Henüz hiç kitap yüklenmedi. Burada sadece senin veya adminin gerçekten yüklediği kaynaklar görünür.</p>
                  </Card>
                ) : null}
              </>
            ) : null}

            {activeView === "admin" && currentUser.role === "admin" ? (
              <>
                <Card>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-400">Admin paneli</p>
                      <h2 className="mt-1 text-2xl font-semibold text-white">Kitap yükle ve kullanıcıları takip et</h2>
                    </div>
                    <Badge tone="emerald">Yönetici erişimi</Badge>
                  </div>
                </Card>

                <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
                  <Card>
                    <h3 className="text-lg font-semibold">Ders kitabı / kaynak yükle</h3>
                    <form className="mt-5 space-y-4" onSubmit={handleAddBook}>
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300">Kitap adı</label>
                        <input
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400/40"
                          value={bookForm.title}
                          onChange={(event) => setBookForm((previous) => ({ ...previous, title: event.target.value }))}
                          placeholder="Örn. 12. Sınıf Matematik Soru Bankası"
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm text-slate-300">Sınıf</label>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400/40"
                            value={bookForm.grade}
                            onChange={(event) => setBookForm((previous) => ({ ...previous, grade: event.target.value }))}
                          >
                            <option>8. Sınıf</option>
                            <option>9. Sınıf</option>
                            <option>10. Sınıf</option>
                            <option>11. Sınıf</option>
                            <option>12. Sınıf</option>
                            <option>Mezun</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm text-slate-300">Ders</label>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400/40"
                            value={bookForm.course}
                            onChange={(event) => setBookForm((previous) => ({ ...previous, course: event.target.value }))}
                          >
                            <option>Matematik</option>
                            <option>Türkçe</option>
                            <option>Fen Bilimleri</option>
                            <option>Sosyal Bilimler</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm text-slate-300">Yayınevi</label>
                          <input
                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400/40"
                            value={bookForm.publisher}
                            onChange={(event) => setBookForm((previous) => ({ ...previous, publisher: event.target.value }))}
                            placeholder="Yayınevi adı"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm text-slate-300">PDF / dosya</label>
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            onChange={handleBookFile}
                            className="block w-full rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-white file:px-4 file:py-2 file:font-medium file:text-slate-950"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300">Konu listesi</label>
                        <textarea
                          rows={5}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400/40"
                          value={bookForm.topicsText}
                          onChange={(event) => setBookForm((previous) => ({ ...previous, topicsText: event.target.value }))}
                          placeholder="Her satıra bir konu yaz"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-slate-300">Açıklama</label>
                        <textarea
                          rows={4}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400/40"
                          value={bookForm.description}
                          onChange={(event) => setBookForm((previous) => ({ ...previous, description: event.target.value }))}
                          placeholder="Bu kaynağın kullanım amacı"
                        />
                      </div>
                      <button className="rounded-2xl bg-violet-500 px-5 py-3 font-semibold text-white transition hover:bg-violet-400">
                        Kitabı Kaydet
                      </button>
                    </form>
                  </Card>

                  <div className="space-y-6">
                    <Card>
                      <h3 className="text-lg font-semibold">Sistem istatistikleri</h3>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <p className="text-sm text-slate-400">Toplam kullanıcı</p>
                          <p className="mt-2 text-3xl font-semibold text-white">{users.length}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <p className="text-sm text-slate-400">Yüklenen kitap</p>
                          <p className="mt-2 text-3xl font-semibold text-white">{books.length}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <p className="text-sm text-slate-400">Deneme kaydı</p>
                          <p className="mt-2 text-3xl font-semibold text-white">{examResults.length}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <p className="text-sm text-slate-400">Plan sayısı</p>
                          <p className="mt-2 text-3xl font-semibold text-white">{studyPlans.length}</p>
                        </div>
                      </div>
                    </Card>

                    <Card>
                      <h3 className="text-lg font-semibold">Kullanıcı listesi</h3>
                      <div className="mt-5 space-y-3">
                        {users.map((user) => (
                          <div key={user.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-white">{user.fullName}</p>
                                <p className="mt-1 text-sm text-slate-400">@{user.username} • {user.email}</p>
                              </div>
                              <Badge tone={user.role === "admin" ? "emerald" : "slate"}>{user.role === "admin" ? "Admin" : "Öğrenci"}</Badge>
                            </div>
                            <p className="mt-3 text-xs text-slate-500">Kayıt tarihi: {formatDate(user.createdAt)}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
