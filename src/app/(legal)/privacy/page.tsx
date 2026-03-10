import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Yoodle",
  description: "How Yoodle collects, uses, and protects your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <article className="prose-legal">
      <h1
        className="text-3xl font-black text-[#0A0A0A] mb-2"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Privacy Policy
      </h1>
      <p className="text-sm text-[#0A0A0A]/50 mb-8" style={{ fontFamily: "var(--font-body)" }}>
        Last updated: March 9, 2026
      </p>

      <div className="space-y-8 text-[#0A0A0A]/80" style={{ fontFamily: "var(--font-body)" }}>
        <section>
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
            1. Introduction
          </h2>
          <p className="leading-relaxed">
            Yoodle (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your
            privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your
            information when you use our video meeting and collaboration platform.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
            2. Information We Collect
          </h2>
          <h3 className="text-base font-semibold text-[#0A0A0A] mb-2">Account Information</h3>
          <ul className="list-disc pl-6 space-y-1 leading-relaxed">
            <li>Name and email address (via Google Sign-In or magic link)</li>
            <li>Profile picture (from Google account, if available)</li>
            <li>Workspace and organization membership</li>
          </ul>

          <h3 className="text-base font-semibold text-[#0A0A0A] mt-4 mb-2">Meeting Data</h3>
          <ul className="list-disc pl-6 space-y-1 leading-relaxed">
            <li>Meeting metadata (titles, schedules, participants, duration)</li>
            <li>Meeting recordings (when you choose to record)</li>
            <li>AI-generated meeting notes, summaries, and action items</li>
            <li>Chat messages within meetings</li>
          </ul>

          <h3 className="text-base font-semibold text-[#0A0A0A] mt-4 mb-2">Ghost Room Data</h3>
          <ul className="list-disc pl-6 space-y-1 leading-relaxed">
            <li>Ghost room content is ephemeral and automatically deleted after 4 hours</li>
            <li>We do not retain ghost room messages or files after expiry</li>
          </ul>

          <h3 className="text-base font-semibold text-[#0A0A0A] mt-4 mb-2">Technical Data</h3>
          <ul className="list-disc pl-6 space-y-1 leading-relaxed">
            <li>IP address and approximate location (for rate limiting and abuse prevention)</li>
            <li>Browser type and operating system</li>
            <li>Usage analytics (feature usage, meeting frequency)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
            3. How We Use Your Information
          </h2>
          <ul className="list-disc pl-6 space-y-1 leading-relaxed">
            <li>To provide and maintain the Yoodle platform</li>
            <li>To authenticate your identity and manage your account</li>
            <li>To enable video meetings, recordings, and AI features</li>
            <li>To connect with your Google Workspace (Calendar, Drive) when authorized</li>
            <li>To send service-related emails (magic links, meeting invitations)</li>
            <li>To monitor and prevent abuse, fraud, and security threats</li>
            <li>To improve the platform based on aggregated usage patterns</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
            4. AI Processing
          </h2>
          <p className="leading-relaxed">
            Yoodle uses third-party AI services (Google Gemini, Anthropic Claude, OpenAI) to generate
            meeting summaries, action items, and insights. Meeting transcripts may be sent to these
            providers for processing. We do not use your data to train AI models. Each provider&apos;s
            data handling is governed by their respective privacy policies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
            5. Data Storage and Security
          </h2>
          <ul className="list-disc pl-6 space-y-1 leading-relaxed">
            <li>Data is stored in encrypted MongoDB databases</li>
            <li>Recordings are stored in encrypted object storage (Vultr/Google Drive)</li>
            <li>All connections use TLS 1.2+ encryption</li>
            <li>Authentication tokens are short-lived (15 minutes) with secure refresh mechanisms</li>
            <li>Passwords are hashed using bcrypt with appropriate salt rounds</li>
            <li>We implement rate limiting, CSRF protection, and security headers</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
            6. Data Sharing
          </h2>
          <p className="leading-relaxed mb-2">
            We do not sell your personal data. We may share information with:
          </p>
          <ul className="list-disc pl-6 space-y-1 leading-relaxed">
            <li><strong>AI Providers</strong> — meeting transcripts for generating summaries (processed, not stored)</li>
            <li><strong>Google</strong> — when you authorize Google Workspace integrations</li>
            <li><strong>Infrastructure Providers</strong> — for hosting (data processing agreements in place)</li>
            <li><strong>Legal Requirements</strong> — when required by law or to protect our rights</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
            7. Your Rights
          </h2>
          <p className="leading-relaxed mb-2">You have the right to:</p>
          <ul className="list-disc pl-6 space-y-1 leading-relaxed">
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your account and associated data</li>
            <li>Export your data in a portable format</li>
            <li>Withdraw consent for optional data processing</li>
            <li>Object to processing based on legitimate interests</li>
          </ul>
          <p className="leading-relaxed mt-2">
            To exercise these rights, contact us at <strong>privacy@yoodle.app</strong>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
            8. Data Retention
          </h2>
          <ul className="list-disc pl-6 space-y-1 leading-relaxed">
            <li>Account data is retained while your account is active</li>
            <li>Meeting recordings are retained until you delete them</li>
            <li>Ghost room content is automatically deleted after 4 hours</li>
            <li>Analytics data is aggregated and anonymized after 90 days</li>
            <li>Upon account deletion, personal data is removed within 30 days</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
            9. Cookies
          </h2>
          <p className="leading-relaxed">
            Yoodle uses essential cookies for authentication (access tokens, refresh tokens). We do not
            use tracking cookies or third-party advertising cookies. Session cookies are encrypted and
            expire automatically.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
            10. Changes to This Policy
          </h2>
          <p className="leading-relaxed">
            We may update this Privacy Policy from time to time. We will notify you of significant
            changes via email or an in-app notification. Continued use of Yoodle after changes
            constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
            11. Contact
          </h2>
          <p className="leading-relaxed">
            For privacy-related questions or concerns, contact us at{" "}
            <strong>privacy@yoodle.app</strong>.
          </p>
        </section>
      </div>
    </article>
  );
}
