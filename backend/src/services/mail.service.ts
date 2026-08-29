import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

export async function sendRegistrationOtp(email: string, otp: string): Promise<void> {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "TrustPay Registration OTP",
    text: `Your TrustPay verification code is:

${otp}

This code expires in 5 minutes.

Do not share this code with anyone.`,
  });
}
