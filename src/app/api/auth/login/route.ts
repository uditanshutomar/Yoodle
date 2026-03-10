import { NextRequest } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";
import { generateMagicLink } from "@/lib/auth/magic-link";
import { checkRateLimit } from "@/lib/api/rate-limit";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 attempts per minute per IP
    await checkRateLimit(request, "auth");

    const body = await request.json();

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(issue.message);
      }
      return errorResponse({
        message: "Validation failed.",
        status: 400,
        errors: fieldErrors,
      });
    }

    const { email } = parsed.data;

    await connectDB();

    // Check if user exists — only fetch fields needed for the email template
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select("_id name displayName");

    // SECURITY: Return the same success message whether user exists or not
    // to prevent user enumeration attacks. If user doesn't exist, we still
    // pretend we sent a magic link.
    if (!user) {
      return successResponse({
        message: "Check your email for login link.",
      });
    }

    // Generate magic link and send email
    const magicLink = await generateMagicLink(email);

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && !resendKey.startsWith("your-")) {
      const resend = new Resend(resendKey);
      const fromAddress = process.env.EMAIL_FROM || "Yoodle <onboarding@resend.dev>";

      try {
        await resend.emails.send({
          from: fromAddress,
          to: email.toLowerCase().trim(),
          subject: "Your Yoodle login link",
          html: buildLoginEmail(user.displayName || user.name, magicLink),
        });
      } catch (emailError) {
        // If email fails, log error but never expose magic link in production
        console.error("[Email Send Error]", emailError);
        if (process.env.NODE_ENV !== "production") {
          console.log("\n✨ [FALLBACK] Magic link for", email);
          console.log("🔗", magicLink, "\n");
        }
      }
    } else {
      // Dev mode: log magic link to console when Resend is not configured
      console.log("\n✨ [DEV MODE] Magic link for", email);
      console.log("🔗", magicLink, "\n");
    }

    return successResponse({
      message: "Check your email for login link.",
    });
  } catch (error) {
    console.error("[Login Error]", error);
    return serverErrorResponse("Something went wrong during login.");
  }
}

function buildLoginEmail(name: string, magicLink: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #FFFBEB; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; margin: 40px auto;">
    <tr>
      <td style="padding: 40px 32px; background-color: #ffffff; border: 3px solid #1a1a1a; border-radius: 16px; box-shadow: 6px 6px 0px #1a1a1a;">

        <!-- Logo -->
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 36px; font-weight: 900; color: #1a1a1a; letter-spacing: -1px;">
            Y<span style="color: #FACC15;">oo</span>dle
          </span>
        </div>

        <!-- Login text -->
        <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 800; color: #1a1a1a; text-align: center;">
          Hey ${name}, welcome back!
        </h1>
        <p style="margin: 0 0 28px 0; font-size: 15px; color: #4a4a4a; text-align: center; line-height: 1.5;">
          Tap the button below to log in to your Yoodle account. No passwords needed — we keep things simple.
        </p>

        <!-- CTA Button -->
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${magicLink}"
             style="display: inline-block; padding: 14px 36px; background-color: #FACC15; color: #1a1a1a; text-decoration: none; font-weight: 800; font-size: 16px; border: 3px solid #1a1a1a; border-radius: 10px; box-shadow: 4px 4px 0px #1a1a1a; transition: all 0.2s;">
            Log In to Yoodle
          </a>
        </div>

        <!-- Expiry note -->
        <p style="margin: 0 0 20px 0; font-size: 13px; color: #888888; text-align: center;">
          This link expires in 15 minutes. If you didn't request this, just ignore it.
        </p>

        <!-- Divider -->
        <hr style="border: none; border-top: 2px dashed #e5e5e5; margin: 20px 0;" />

        <!-- Footer -->
        <p style="margin: 0; font-size: 12px; color: #aaaaaa; text-align: center; line-height: 1.5;">
          Yoodle — Meetings for the New Workforce<br/>
          Video calls, AI notes, shared workspaces.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
