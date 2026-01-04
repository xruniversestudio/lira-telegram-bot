
import { Telegraf, Markup } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN env var");

const bot = new Telegraf(BOT_TOKEN);

// ---- Data (from your app) ----
const JASMINE_IMG = "https://cdn-icons-png.flaticon.com/512/5075/5075794.png";

const DENOMS = [
  { v: 500, n: { ar: "سنابل القمح", en: "Wheat Ears" }, s: "🌾", img: null },
  { v: 200, n: { ar: "أغصان الزيتون", en: "Olive Branches" }, s: "🫒", img: null },
  { v: 100, n: { ar: "القطن السوري", en: "Syrian Cotton" }, s: "☁️", img: null },
  { v: 50, n: { ar: "الحمضيات", en: "Citrus" }, s: "🍊", img: null },
  { v: 25, n: { ar: "العنب", en: "Grapes" }, s: "🍇", img: null },
  { v: 10, n: { ar: "ياسمين الشام", en: "Damask Jasmine" }, s: null, img: JASMINE_IMG }
];

const TRANSLATIONS = {
  ar: {
    title: "دليل الليرة",
    subtitle: "دليل العملة السورية الجديدة",
    oldToNew: "من قديم لجديد",
    newToOld: "من جديد لقديم",
    enterAmount: "أرسل المبلغ",
    result: "الناتج",
    howToPay: "توزيع الفئات النقدية",
    changeNote: "ملاحظة الفراطة",
    changeDesc: "بقي {leftover} ليرة جديدة، تدفعها بالقديم: ({oldAmount} ل.س).",
    unitOld: "ل.س قديمة",
    unitNew: "ليرة جديدة",
    help: "اكتب رقم (مثال: 50000 أو ١٠٠٠٠٠٠).",
    invalid: "أرسل رقم صحيح فقط 🙏",
    updated: "تم تحديث الإعدادات ✅"
  },
  en: {
    title: "Lira Guide",
    subtitle: "Syrian New Currency Guide",
    oldToNew: "Old → New",
    newToOld: "New → Old",
    enterAmount: "Send amount",
    result: "Result",
    howToPay: "Banknote distribution",
    changeNote: "Small change",
    changeDesc: "{leftover} New leftover, pay in Old: ({oldAmount} SYP).",
    unitOld: "Old SYP",
    unitNew: "New Lira",
    help: "Send a number (e.g., 50000).",
    invalid: "Please send a valid number 🙏",
    updated: "Settings updated ✅"
  }
};

// ---- Simple per-user state (MVP) ----
const userState = new Map(); // userId -> { lang, mode }

function getState(userId) {
  if (!userState.has(userId)) userState.set(userId, { lang: "ar", mode: "oldToNew" });
  return userState.get(userId);
}

// Arabic digit normalization
function convertArabicNumbers(str) {
  const map = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9" };
  return String(str).replace(/[٠-٩]/g, (d) => map[d] ?? d);
}

function parseAmount(text) {
  const cleaned = convertArabicNumbers(text).replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

function calc(mode, inputAmount) {
  const isOldToNew = mode === "oldToNew";
  const currentResult = isOldToNew ? (inputAmount / 100) : (inputAmount * 100);
  const amountInNew = isOldToNew ? currentResult : inputAmount;

  let current = amountInNew;
  const parts = [];

  if (current > 0) {
    for (const d of DENOMS) {
      const count = Math.floor(current / d.v);
      if (count > 0) {
        parts.push({ ...d, count });
        current = Math.round((current - count * d.v) * 100) / 100;
      }
    }
  }

  return { currentResult, amountInNew, parts, leftover: current };
}

function nfFor(lang) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-SY" : "en-US", { maximumFractionDigits: 2 });
}

function formatReply(lang, mode, inputAmount, resultObj) {
  const t = TRANSLATIONS[lang];
  const nf = nfFor(lang);
  const isOldToNew = mode === "oldToNew";

  const inputUnit = isOldToNew ? t.unitOld : t.unitNew;
  const outputUnit = isOldToNew ? t.unitNew : t.unitOld;

  const lines = [];
  lines.push(`*${t.title}* — _${t.subtitle}_`);
  lines.push("");
  lines.push(`• ${t.enterAmount}: *${nf.format(inputAmount)}* ${inputUnit}`);
  lines.push(`• ${t.result}: *${nf.format(resultObj.currentResult)}* ${outputUnit}`);
  lines.push("");
  lines.push(`*${t.howToPay}* (New):`);

  if (resultObj.amountInNew <= 0 || resultObj.parts.length === 0) {
    lines.push(lang === "ar" ? "— لا يوجد توزيع" : "— No breakdown");
  } else {
    for (const p of resultObj.parts) {
      const icon = p.img ? "🌼" : (p.s ?? "💵");
      lines.push(`• *${p.v}* ${icon} — ${p.n[lang]}  × *${p.count}*`);
    }
  }

  if (resultObj.leftover > 0 && resultObj.amountInNew > 0) {
    const oldAmount = Math.round(resultObj.leftover * 100);
    lines.push("");
    lines.push(`*${t.changeNote}*`);
    lines.push(
      t.changeDesc
        .replace("{leftover}", nf.format(resultObj.leftover))
        .replace("{oldAmount}", nf.format(oldAmount))
    );
  }

  lines.push("");
  lines.push(lang === "ar" ? "_أرسل رقم جديد للحساب._" : "_Send another number to recalc._");

  return lines.join("\n");
}

function settingsKeyboard(lang, mode) {
  const t = TRANSLATIONS[lang];
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(lang === "ar" ? "عربي" : "AR", "lang:ar"),
      Markup.button.callback(lang === "ar" ? "EN" : "English", "lang:en")
    ],
    [
      Markup.button.callback(t.oldToNew, "mode:oldToNew"),
      Markup.button.callback(t.newToOld, "mode:newToOld")
    ]
  ]);
}

// ---- Bot handlers ----
bot.start(async (ctx) => {
  const st = getState(ctx.from.id);
  const t = TRANSLATIONS[st.lang];
  await ctx.reply(`${t.help}`, settingsKeyboard(st.lang, st.mode));
});

bot.on("callback_query", async (ctx) => {
  const st = getState(ctx.from.id);
  const data = ctx.callbackQuery?.data || "";

  if (data.startsWith("lang:")) {
    st.lang = data.split(":")[1] === "en" ? "en" : "ar";
    await ctx.answerCbQuery(TRANSLATIONS[st.lang].updated);
    return ctx.editMessageReplyMarkup(settingsKeyboard(st.lang, st.mode).reply_markup);
  }

  if (data.startsWith("mode:")) {
    st.mode = data.split(":")[1] === "newToOld" ? "newToOld" : "oldToNew";
    await ctx.answerCbQuery(TRANSLATIONS[st.lang].updated);
    return ctx.editMessageReplyMarkup(settingsKeyboard(st.lang, st.mode).reply_markup);
  }

  await ctx.answerCbQuery();
});

bot.on("text", async (ctx) => {
  const st = getState(ctx.from.id);
  const t = TRANSLATIONS[st.lang];

  const amount = parseAmount(ctx.message.text);
  if (amount === null) return ctx.reply(t.invalid);

  const resultObj = calc(st.mode, amount);
  const msg = formatReply(st.lang, st.mode, amount, resultObj);

  await ctx.replyWithMarkdown(msg, settingsKeyboard(st.lang, st.mode));
});

// ---- Vercel webhook handler ----
export default async function handler(req, res) {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send("ok");
  } catch (e) {
    console.error(e);
    res.status(500).send("error");
  }
}
