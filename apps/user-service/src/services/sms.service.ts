import twilio from "twilio";
import { config } from "../config";

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

/**
 * ⚠️ SPEC GAP: neither CONVENTIONS.md nor API_CONTRACT.md specifies SMS
 * copy/localization. Sending a plain English template regardless of the
 * user's preferred_language, since at OTP-request time we may not have a
 * user record yet (first-time signup).
 */
export async function sendOtpSms(phoneNumber: string, otp: string): Promise<void> {
  await client.messages.create({
    to: phoneNumber,
    from: config.twilio.fromNumber,
    body: `${otp} is your GigFinance AI verification code. It expires in 5 minutes. Do not share this code.`,
  });
}
