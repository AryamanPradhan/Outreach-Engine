import nodemailer from "nodemailer";

function createTransporter(index: 0 | 1) {
  const suffix = index === 0 ? "" : "_2";
  return nodemailer.createTransport({
    host: process.env[`SMTP_HOST${suffix}`] || "smtp.gmail.com",
    port: parseInt(process.env[`SMTP_PORT${suffix}`] || "587"),
    secure: false,
    auth: {
      user: process.env[`SMTP_USER${suffix}`],
      pass: process.env[`SMTP_PASS${suffix}`],
    },
  });
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
  const suffix = accountIndex === 0 ? "" : "_2";
  const senderName = process.env[`SENDER_NAME${suffix}`] || "Your Name";
  const senderEmail = process.env[`SMTP_USER${suffix}`];

  const transporter = createTransporter(accountIndex);

  await transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`,
    to,
    bcc: bcc && bcc.length ? bcc : undefined,
    subject,
    text: body,
    html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
  });
}
