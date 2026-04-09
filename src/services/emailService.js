
const nodemailer = require('nodemailer');

const createTransporter = () => nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: process.env.AUTH_EMAIL, pass: process.env.AUTH_PASS },
  tls: { rejectUnauthorized: false }
});

exports.sendMail = async ({ to, subject, html }) => {
  const transporter = createTransporter();
  await transporter.verify();
  await transporter.sendMail({
    from: `"HOMS Support" <${process.env.AUTH_EMAIL}>`,
    to, subject, html
  });
};