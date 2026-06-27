import nodemailer from "nodemailer";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createTransporter(index: 0 | 1) {
  const suffix = index === 0 ? "" : "_2";
  const user = process.env[`SMTP_USER${suffix}`];
  const pass = process.env[`SMTP_PASS${suffix}`];
  if (!user || !pass) {
    throw new Error(`Missing SMTP_USER${suffix} or SMTP_PASS${suffix} env var`);
  }

  return nodemailer.createTransport({
    host: process.env[`SMTP_HOST${suffix}`] || "smtp.gmail.com",
    port: parseInt(process.env[`SMTP_PORT${suffix}`] || "587"),
    secure: false,
    requireTLS: true,
    auth: { user, pass },
  });
}

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail(email: string): boolean {
  return EMAIL_FORMAT_RE.test(email) && email.length <= 254;
}

export async function sendEmail({
  to,
  bcc,
  subject,
  body,
  accountIndex,
}: {
  to: string;
  bcc?: string[];
  subject: string;
  body: string;
  accountIndex: 0 | 1;
}) {
  if (!validateEmail(to)) {
    throw new Error(`Invalid recipient email: ${to}`);
  }
  const validBcc = (bcc ?? []).filter(validateEmail);

  const suffix = accountIndex === 0 ? "" : "_2";
  const senderName = (process.env[`SENDER_NAME${suffix}`] || "Your Name").replace(/"/g, "");
  const senderEmail = process.env[`SMTP_USER${suffix}`]!;

  const transporter = createTransporter(accountIndex);

  const safeBody = escapeHtml(body);

  await transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    to,
    bcc: validBcc.length ? validBcc : undefined,
    subject,
    text: body,
    html: `<p>${safeBody.replace(/\n/g, "<br>")}</p>`,
  });
}
