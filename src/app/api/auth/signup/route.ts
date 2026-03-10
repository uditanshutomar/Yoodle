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

const signupSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  name: z
    .string()
    .min(1, "Name is required.")
    .max(100, "Name must be 100 characters or fewer."),
  displayName: z
    .string()
    .min(1, "Display name is required.")
    .max(50, "Display name must be 50 characters or fewer."),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 attempts per minute per IP
    await checkRateLimit(request, "auth");

    const body = await request.json();

    const parsed = signupSchema.safeParse(body);
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

    const { email, name, displayName } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    await connectDB();

    // Atomic check-and-create to prevent race conditions.
    // Uses findOneAndUpdate with upsert + $setOnInsert so that:
    //   - If user exists: returns existing doc (was created before this call)
    //   - If user doesn't exist: atomically creates it
    const result = await User.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $setOnInsert: {
          email: normalizedEmail,
          name,
          displayName,
          status: "offline",
          preferences: {
            notifications: true,
            ghostModeDefault: false,
            theme: "auto",
          },
        },
      },
      { upsert: true, new: false } // new: false returns null if doc was just created
    );

    // If result is non-null, the user already existed (not a fresh upsert)
    if (result !== null) {
      return errorResponse({
        message: "Email already registered.",
        status: 409,
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
          subject: "Welcome to Yoodle! Verify your account",
          html: buildWelcomeEmail(name, magicLink),
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
      status: 201,
    });
  } catch (error) {
    console.error("[Signup Error]", error);
    return serverErrorResponse("Something went wrong during signup.");
  }
}

function buildWelcomeEmail(name: string, magicLink: string): string {
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

        <!-- Welcome text -->
        <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 800; color: #1a1a1a; text-align: center;">
          Welcome aboard, ${name}!
        </h1>
        <p style="margin: 0 0 28px 0; font-size: 15px; color: #4a4a4a; text-align: center; line-height: 1.5;">
          You're one click away from joining meetings that don't suck. Tap the button below to verify your account.
        </p>

        <!-- CTA Button -->
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${magicLink}"
             style="display: inline-block; padding: 14px 36px; background-color: #FACC15; color: #1a1a1a; text-decoration: none; font-weight: 800; font-size: 16px; border: 3px solid #1a1a1a; border-radius: 10px; box-shadow: 4px 4px 0px #1a1a1a; transition: all 0.2s;">
            Verify & Get Started
          </a>
        </div>

        <!-- Expiry note -->
        <p style="margin: 0 0 20px 0; font-size: 13px; color: #888888; text-align: center;">
          This link expires in 15 minutes. If you didn't sign up for Yoodle, just ignore this email.
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
