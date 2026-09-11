import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

type ReceiptData = {
  employee: {
    name: string;
    employee_id?: string | null;
    email?: string | null;
  };
  month: string;
  baseSalary: number;
  actualLateDays: number;
  actualAbsentDays: number;
  actualHalfDays: number;
  lateDays: number;
  absentDays: number;
  halfDays: number;
  deductionAmount: number;
  netPay: number;
  paidAt: string;
  adjustmentNote?: string | null;
};

const coral = rgb(0.89, 0.35, 0.35);
const ink = rgb(0.16, 0.12, 0.11);
const muted = rgb(0.45, 0.4, 0.38);
const soft = rgb(0.99, 0.95, 0.94);

function money(value: number) {
  return `PKR ${Math.round(Number(value || 0)).toLocaleString("en-PK")}`;
}

function monthLabel(month: string) {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return month;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
}

function dateLabel(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? "-"
    : parsed.toLocaleDateString("en-US");
}

export async function generateSalaryReceiptPdf(data: ReceiptData) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const page = document.addPage([595, 720]);
  const regular = await document.embedFont(
    await readFile(
      path.join(
        process.cwd(),
        "node_modules",
        "@fontsource",
        "poppins",
        "files",
        "poppins-latin-400-normal.woff",
      ),
    ),
  );
  const bold = await document.embedFont(
    await readFile(
      path.join(
        process.cwd(),
        "node_modules",
        "@fontsource",
        "poppins",
        "files",
        "poppins-latin-600-normal.woff",
      ),
    ),
  );
  const { width, height } = page.getSize();
  const logoPath = path.join(process.cwd(), "public", "logo.png");

  try {
    const logo = await document.embedPng(await readFile(logoPath));
    const logoScale = Math.min(118 / logo.width, 42 / logo.height);
    page.drawImage(logo, {
      x: 48,
      y: height - 86,
      width: logo.width * logoScale,
      height: logo.height * logoScale,
    });
  } catch {
    page.drawText("DIGIFY IT SOLUTION", {
      x: 48,
      y: height - 68,
      size: 13,
      font: bold,
      color: coral,
    });
  }

  page.drawText("SALARY RECEIPT", {
    x: 365,
    y: height - 65,
    size: 18,
    font: bold,
    color: ink,
  });
  page.drawText("Official payment statement", {
    x: 365,
    y: height - 82,
    size: 9,
    font: regular,
    color: muted,
  });
  page.drawLine({
    start: { x: 48, y: height - 108 },
    end: { x: width - 48, y: height - 108 },
    thickness: 2,
    color: coral,
  });

  page.drawText("EMPLOYEE", {
    x: 48,
    y: height - 145,
    size: 8,
    font: bold,
    color: coral,
  });
  page.drawText(data.employee.name, {
    x: 48,
    y: height - 169,
    size: 19,
    font: bold,
    color: ink,
  });
  page.drawText(`Employee ID: ${data.employee.employee_id ?? "-"}`, {
    x: 48,
    y: height - 187,
    size: 9,
    font: regular,
    color: muted,
  });
  page.drawText(`Pay period: ${monthLabel(data.month)}`, {
    x: 350,
    y: height - 155,
    size: 10,
    font: regular,
    color: muted,
  });
  page.drawText(`Paid on: ${dateLabel(data.paidAt)}`, {
    x: 350,
    y: height - 173,
    size: 10,
    font: regular,
    color: muted,
  });

  page.drawRectangle({
    x: 48,
    y: height - 300,
    width: width - 96,
    height: 92,
    color: soft,
  });
  page.drawText("NET PAY", {
    x: 72,
    y: height - 238,
    size: 9,
    font: bold,
    color: coral,
  });
  page.drawText(money(data.netPay), {
    x: 72,
    y: height - 273,
    size: 27,
    font: bold,
    color: ink,
  });
  page.drawText(
    "This receipt confirms the salary payout recorded by Digify IT Solution.",
    {
      x: 300,
      y: height - 252,
      size: 9,
      font: regular,
      color: muted,
      maxWidth: 170,
    },
  );

  const rows = [
    ["Base salary", money(data.baseSalary)],
    ["Total deduction", money(data.deductionAmount)],
    ["Net payable", money(data.netPay)],
  ];
  const attendanceRows = [
    ["Late days", data.actualLateDays, data.lateDays],
    ["Half days", data.actualHalfDays, data.halfDays],
    ["Absent days", data.actualAbsentDays, data.absentDays],
  ];
  let y = height - 350;
  page.drawText("PAYMENT SUMMARY", {
    x: 48,
    y,
    size: 9,
    font: bold,
    color: coral,
  });
  y -= 24;
  rows.forEach(([label, value], index) => {
    if (index % 2 === 0)
      page.drawRectangle({
        x: 48,
        y: y - 7,
        width: width - 96,
        height: 25,
        color: rgb(0.99, 0.98, 0.97),
      });
    page.drawText(label, { x: 64, y, size: 10, font: regular, color: muted });
    page.drawText(value, {
      x: 400,
      y,
      size: 10,
      font: index === rows.length - 1 ? bold : regular,
      color: index === rows.length - 1 ? coral : ink,
    });
    y -= 25;
  });

  y -= 18;
  page.drawText("ATTENDANCE & SALARY ADJUSTMENT", {
    x: 48,
    y,
    size: 9,
    font: bold,
    color: coral,
  });
  y -= 26;
  page.drawRectangle({
    x: 48,
    y: y - 7,
    width: width - 96,
    height: 20,
    color: rgb(0.96, 0.93, 0.91),
  });
  page.drawText("Attendance", { x: 64, y, size: 8, font: bold, color: muted });
  page.drawText("Actual days", {
    x: 290,
    y,
    size: 8,
    font: bold,
    color: muted,
  });
  page.drawText("Salary cut", { x: 365, y, size: 8, font: bold, color: muted });
  page.drawText("Not cut by admin", {
    x: 435,
    y,
    size: 8,
    font: bold,
    color: muted,
  });
  y -= 22;
  attendanceRows.forEach(([label, actual, deducted], index) => {
    const waived = Number(actual) - Number(deducted);
    if (index % 2 === 0)
      page.drawRectangle({
        x: 48,
        y: y - 7,
        width: width - 96,
        height: 25,
        color: rgb(0.99, 0.98, 0.97),
      });
    page.drawText(String(label), {
      x: 64,
      y,
      size: 9,
      font: regular,
      color: ink,
    });
    page.drawText(String(actual), {
      x: 310,
      y,
      size: 9,
      font: regular,
      color: ink,
    });
    page.drawText(String(deducted), {
      x: 385,
      y,
      size: 9,
      font: regular,
      color: ink,
    });
    page.drawText(String(waived), {
      x: 480,
      y,
      size: 9,
      font: bold,
      color: waived > 0 ? coral : ink,
    });
    y -= 25;
  });

  const waivedDays =
    data.actualLateDays -
    data.lateDays +
    (data.actualAbsentDays - data.absentDays) +
    (data.actualHalfDays - data.halfDays);
  const adminNotes = [
    waivedDays > 0
      ? `${waivedDays} attendance day${waivedDays === 1 ? "" : "s"} recorded, but not deducted from this payout.`
      : "",
    data.adjustmentNote ? `Note: ${data.adjustmentNote.slice(0, 150)}` : "",
  ].filter(Boolean);
  if (adminNotes.length) {
    y -= 12;
    const notesHeight = adminNotes.length > 1 ? 58 : 42;
    page.drawRectangle({
      x: 48,
      y: y - notesHeight + 12,
      width: width - 96,
      height: notesHeight,
      color: rgb(1, 0.96, 0.91),
    });
    page.drawText("ADMIN NOTES", {
      x: 64,
      y,
      size: 8,
      font: bold,
      color: coral,
    });
    adminNotes.forEach((note, index) => {
      page.drawText(note, {
        x: 64,
        y: y - 17 - index * 17,
        size: 9,
        font: regular,
        color: ink,
        maxWidth: width - 128,
      });
    });
    y -= notesHeight + 12;
  }

  page.drawLine({
    start: { x: 48, y: 52 },
    end: { x: width - 48, y: 52 },
    thickness: 1,
    color: rgb(0.88, 0.82, 0.8),
  });
  page.drawText("Digify IT Solution", {
    x: 48,
    y: 34,
    size: 9,
    font: bold,
    color: ink,
  });
  page.drawText("Computer-generated receipt · No signature required", {
    x: 48,
    y: 18,
    size: 8,
    font: regular,
    color: muted,
  });
  page.drawText("Thank you", {
    x: width - 96,
    y: 27,
    size: 10,
    font: bold,
    color: coral,
  });

  return document.save();
}
