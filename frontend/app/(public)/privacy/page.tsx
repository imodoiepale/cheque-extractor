import { LegalShell } from '@/components/landing/LegalShell';

export const metadata = {
  title: 'Privacy Policy | Kyriq',
  description: 'Privacy Policy for Kyriq',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="March 19, 2026">
      <h2>1. Introduction</h2>
      <p>
        Kyriq (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) provides this Privacy Policy to explain how we collect, use, disclose, and safeguard your information when you use our check reconciliation platform, including our web application, Chrome extension, and related services (collectively, the &ldquo;Service&rdquo;).
      </p>

      <h2>2. Information We Collect</h2>
      <p>We collect the following types of information:</p>
      <ul>
        <li><strong>Account Information:</strong> Name, email address, company name, and password when you create an account.</li>
        <li><strong>Financial Data:</strong> Check images, extracted check data (payee names, amounts, dates, check numbers), and QuickBooks transaction data that you voluntarily upload or connect to the Service.</li>
        <li><strong>Usage Data:</strong> Log data, device information, browser type, pages visited, and features used within the Service.</li>
        <li><strong>Integration Data:</strong> OAuth tokens and connection details for third-party services like QuickBooks Online, Xero, Sage, and Zoho that you authorize.</li>
      </ul>

      <h2>3. How We Use Your Information</h2>
      <p>We use collected information to:</p>
      <ul>
        <li>Provide, operate, and maintain the Service</li>
        <li>Process check images using AI-powered OCR extraction</li>
        <li>Match extracted check data against your accounting software transactions</li>
        <li>Improve and personalize your experience</li>
        <li>Send administrative communications (account updates, security alerts)</li>
        <li>Provide customer support</li>
        <li>Comply with legal obligations</li>
      </ul>

      <h2>4. Data Storage and Security</h2>
      <p>
        Your data is stored securely using industry-standard encryption (AES-256 at rest, TLS 1.3 in transit). We use Supabase as our database provider, which is SOC 2 Type II compliant. Check images are processed in memory and are not permanently stored after extraction unless you explicitly choose to retain them.
      </p>

      <h2>5. Third-Party Services</h2>
      <p>We integrate with the following third-party services:</p>
      <ul>
        <li><strong>Google Gemini AI:</strong> For OCR processing of check images. Images are sent via encrypted API calls and are not retained by Google beyond processing.</li>
        <li><strong>Intuit QuickBooks:</strong> For transaction matching and reconciliation. We access only the data you authorize via OAuth 2.0.</li>
        <li><strong>Supabase:</strong> For authentication and data storage.</li>
      </ul>

      <h2>6. Data Sharing</h2>
      <p>
        We do not sell your personal information. We share data only with service providers necessary to operate the Service, when required by law, or with your explicit consent.
      </p>

      <h2>7. Data Retention</h2>
      <p>
        We retain your account data for as long as your account is active. Financial data (check images and extracted data) is retained according to your plan settings. You may request deletion of your data at any time by contacting us.
      </p>

      <h2>8. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access, correct, or delete your personal information</li>
        <li>Export your data in standard formats (CSV, JSON)</li>
        <li>Revoke third-party integrations at any time</li>
        <li>Close your account and request data deletion</li>
      </ul>

      <h2>9. Cookies</h2>
      <p>
        We use essential cookies for authentication and session management. We do not use third-party tracking cookies or advertising cookies.
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of significant changes via email or through the Service.
      </p>

      <h2>11. Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy, please contact us at{' '}
        <a href="mailto:privacy@itaxhub.com">privacy@itaxhub.com</a>.
      </p>
    
    </LegalShell>
  );
}
