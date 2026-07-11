import fs from 'fs';
import path from 'path';

const experts = {
  philosopher: { en: 'Philosopher', ru: 'Философ', es: 'Filósofo', pt: 'Filósofo', it: 'Filosofo', ar: 'فيلسوف', fa: 'فیلسوف', tr: 'Filozof', uk: 'Філософ', ja: '哲学者', ko: '철학자' },
  buddhist_tradition: { en: 'Buddhist (tradition)', ru: 'Буддист (учение)', es: 'Budista (tradición)', pt: 'Budista (tradição)', it: 'Buddhista (tradizione)', ar: 'بوذي (تقليد)', fa: 'بودایی (سنت)', tr: 'Budist (gelenek)', uk: 'Буддист (вчення)', ja: '仏教徒（伝統）', ko: '불교도 (전통)' },
  christian_tradition: { en: 'Christian (tradition)', ru: 'Христианин (учение)', es: 'Cristiano (tradición)', pt: 'Cristão (tradição)', it: 'Cristiano (tradizione)', ar: 'مسيحي (تقليد)', fa: 'مسیحی (سنت)', tr: 'Hristiyan (gelenek)', uk: 'Християнин (вчення)', ja: 'キリスト教徒（伝統）', ko: '기독교인 (전통)' },
  daoist_tradition: { en: 'Daoist (tradition)', ru: 'Даос (учение)', es: 'Taoísta (tradición)', pt: 'Taoísta (tradição)', it: 'Taoista (tradizione)', ar: 'طاوي (تقليد)', fa: 'تائوئیست (سنت)', tr: 'Taocu (gelenek)', uk: 'Даос (вчення)', ja: '道教徒（伝統）', ko: '도교도 (전통)' },
  confucian_tradition: { en: 'Confucian (tradition)', ru: 'Конфуцианец (учение)', es: 'Confuciano (tradición)', pt: 'Confucionista (tradição)', it: 'Confuciano (tradizione)', ar: 'كونفوشيوسي (تقليد)', fa: 'کنفوسیوس (سنت)', tr: 'Konfüçyüsçü (gelenek)', uk: 'Конфуціанець (вчення)', ja: '儒教徒（伝統）', ko: '유교도 (전통)' },
  hindu_tradition: { en: 'Hindu (tradition)', ru: 'Индуист (учение)', es: 'Hindú (tradición)', pt: 'Hindu (tradição)', it: 'Induista (tradizione)', ar: 'هندوسي (تقليد)', fa: 'هندو (سنت)', tr: 'Hindu (gelenek)', uk: 'Індуїст (вчення)', ja: 'ヒンドゥー教徒（伝統）', ko: '힌두교도 (전통)' },
  hare_krishna_tradition: { en: 'Hare Krishna (tradition)', ru: 'Кришнаит (учение)', es: 'Hare Krishna (tradición)', pt: 'Hare Krishna (tradição)', it: 'Hare Krishna (tradizione)', ar: 'هاري كريشنا (تقليد)', fa: 'هاره کریشنا (سنت)', tr: 'Hare Krishna (gelenek)', uk: 'Крішнаїт (вчення)', ja: 'ハレ・クリシュナ（伝統）', ko: '하레 크리슈나 (전통)' },
  muslim_tradition: { en: 'Muslim (tradition)', ru: 'Мусульманин (учение)', es: 'Musulmán (tradición)', pt: 'Muçulmano (tradição)', it: 'Musulmano (tradizione)', ar: 'مسلم (تقليد)', fa: 'مسلمان (سنت)', tr: 'Müslüman (gelenek)', uk: 'Мусульманин (вчення)', ja: 'イスラム教徒（伝統）', ko: '무슬림 (전통)' },
  jewish_tradition: { en: 'Jewish (tradition)', ru: 'Иудей (учение)', es: 'Judío (tradición)', pt: 'Judeu (tradição)', it: 'Ebreo (tradizione)', ar: 'يهودي (تقليد)', fa: 'یهودی (سنت)', tr: 'Yahudi (gelenek)', uk: 'Іудей (вчення)', ja: 'ユダヤ教徒（伝統）', ko: '유대인 (전통)' },
  sikh_tradition: { en: 'Sikh (tradition)', ru: 'Сикх (учение)', es: 'Sij (tradición)', pt: 'Sikh (tradição)', it: 'Sikh (tradizione)', ar: 'سيخي (تقليد)', fa: 'سیک (سنت)', tr: 'Sih (gelenek)', uk: 'Сикх (вчення)', ja: 'シク教徒（伝統）', ko: '시크교도 (전통)' },
  psychologist: { en: 'Psychologist (theory)', ru: 'Психолог (теория)', es: 'Psicólogo (teoría)', pt: 'Psicólogo (teoria)', it: 'Psicologo (teoria)', ar: 'عالم نفس (نظرية)', fa: 'روانشناس (نظریه)', tr: 'Psikolog (teori)', uk: 'Психолог (теорія)', ja: '心理学者（理論）', ko: '심리학자 (이론)' },
  political_scientist: { en: 'Political Scientist', ru: 'Политолог', es: 'Politólogo', pt: 'Cientista Político', it: 'Politologo', ar: 'عالم سياسة', fa: 'دانشمند علوم سیاسی', tr: 'Siyaset Bilimci', uk: 'Політолог', ja: '政治学者', ko: '정치학자' },
  medical_doctor: { en: 'Doctor (education)', ru: 'Врач (образование)', es: 'Médico (educación)', pt: 'Médico (educação)', it: 'Medico (educazione)', ar: 'طبيب (تعليم)', fa: 'پزشک (آموزش)', tr: 'Doktor (eğitim)', uk: 'Лікар (освіта)', ja: '医師（教育）', ko: '의사 (교육)' },
  physicist: { en: 'Physicist', ru: 'Физик', es: 'Físico', pt: 'Físico', it: 'Fisico', ar: 'فيزيائي', fa: 'فیزیکدان', tr: 'Fizikçi', uk: 'Фізик', ja: '物理学者', ko: '물리학자' },
  chemist: { en: 'Chemist', ru: 'Химик', es: 'Químico', pt: 'Químico', it: 'Chimico', ar: 'كيميائي', fa: 'شیمیدان', tr: 'Kimyager', uk: 'Хімік', ja: '化学者', ko: '화학자' },
  biologist: { en: 'Biologist', ru: 'Биолог', es: 'Biólogo', pt: 'Biólogo', it: 'Biologo', ar: 'عالم أحياء', fa: 'زیست‌شناس', tr: 'Biyolog', uk: 'Біолог', ja: '生物学者', ko: '생물학자' },
  mathematician: { en: 'Mathematician', ru: 'Математик', es: 'Matemático', pt: 'Matemático', it: 'Matematico', ar: 'عالم رياضيات', fa: 'ریاضیدان', tr: 'Matematikçi', uk: 'Математик', ja: '数学者', ko: '수학자' },
  historian: { en: 'Historian', ru: 'Историк', es: 'Historiador', pt: 'Historiador', it: 'Storico', ar: 'مؤرخ', fa: 'مورخ', tr: 'Tarihçi', uk: 'Історик', ja: '歴史家', ko: '역사가' },
  economist: { en: 'Economist', ru: 'Экономист', es: 'Economista', pt: 'Economista', it: 'Economista', ar: 'خبير اقتصادي', fa: 'اقتصاددان', tr: 'Ekonomist', uk: 'Економіст', ja: '経済学者', ko: '경제학자' },
  sociologist: { en: 'Sociologist', ru: 'Социолог', es: 'Sociólogo', pt: 'Sociólogo', it: 'Sociologo', ar: 'عالم اجتماع', fa: 'جامعه‌شناس', tr: 'Sosyolog', uk: 'Соціолог', ja: '社会学者', ko: '사회학자' },
  legal_scholar: { en: 'Legal Scholar', ru: 'Юрист (образование)', es: 'Jurista (educación)', pt: 'Jurista (educação)', it: 'Giurista (educazione)', ar: 'عالم قانون (تعليم)', fa: 'حقوقدان (آموزش)', tr: 'Hukukçu (eğitim)', uk: 'Юрист (освіта)', ja: '法学者（教育）', ko: '법학자 (교육)' },
  literary_scholar: { en: 'Literary Scholar', ru: 'Литературовед', es: 'Crítico literario', pt: 'Crítico literário', it: 'Critico letterario', ar: 'ناقد أدبي', fa: 'منتقد ادبی', tr: 'Edebiyat Eleştirmeni', uk: 'Літературознавець', ja: '文学研究者', ko: '문학 연구가' },
  art_historian: { en: 'Art Historian', ru: 'Искусствовед', es: 'Historiador del arte', pt: 'Historiador da arte', it: 'Storico dell\'arte', ar: 'مؤرخ فني', fa: 'مورخ هنر', tr: 'Sanat Tarihçisi', uk: 'Мистецтвознавець', ja: '美術史家', ko: '미술 사학자' },
  computer_scientist: { en: 'Computer Scientist', ru: 'Информатик', es: 'Informático', pt: 'Cientista da Computação', it: 'Informatico', ar: 'عالم حاسوب', fa: 'دانشمند علوم کامپیوتر', tr: 'Bilgisayar Bilimcisi', uk: 'Інформатик', ja: '計算機科学者', ko: '컴퓨터 과학자' },
  astronomer: { en: 'Astronomer', ru: 'Астроном', es: 'Astrónomo', pt: 'Astrônomo', it: 'Astronomo', ar: 'عالم فلك', fa: 'ستاره‌شناس', tr: 'Astronom', uk: 'Астроном', ja: '天文学者', ko: '천문학자' },
  linguist: { en: 'Linguist', ru: 'Лингвист', es: 'Lingüista', pt: 'Linguista', it: 'Linguista', ar: 'لغوي', fa: 'زبان‌شناس', tr: 'Dilbilimci', uk: 'Лінгвіст', ja: '言語学者', ko: '언어학자' },
  geographer: { en: 'Geographer', ru: 'Географ', es: 'Geógrafo', pt: 'Geógrafo', it: 'Geografo', ar: 'جغرافي', fa: 'جغرافی‌دان', tr: 'Coğrafyacı', uk: 'Географ', ja: '地理学者', ko: '지리학자' },
  neuroscientist: { en: 'Neuroscientist', ru: 'Нейробиолог', es: 'Neurocientífico', pt: 'Neurocientista', it: 'Neuroscienziato', ar: 'عالم أعصاب', fa: 'عصب‌شناس', tr: 'Sinirbilimci', uk: 'Нейробіолог', ja: '神経科学者', ko: '신경과학자' }
};

const dir = 'c:/Users/Пайчармик/seashell_tg_clean/src/i18n/messages';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'index.js');

for (const file of files) {
  const lang = file.replace('.js', '');
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf8');
  
  let injection = '';
  for (const [id, translations] of Object.entries(experts)) {
    const text = translations[lang] || translations.en;
    injection += `  'practice.expert.${id}': ${JSON.stringify(text)},\n`;
  }
  
  // Insert before the last closing brace
  content = content.replace(/};\s*$/, `${injection}};\n`);
  fs.writeFileSync(p, content);
  console.log(`Updated ${file}`);
}
