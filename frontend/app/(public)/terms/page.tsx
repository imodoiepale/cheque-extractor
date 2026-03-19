import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service | CheckSync Pro',
  description: 'Terms of Service for CheckSync Pro by iTax Hub',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center text-white text-[10px] font-black shadow-sm">CS</div>
            <span className="text-base font-extrabold text-gray-900">CheckSync Pro</span>
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1.5 transition-colors">
            <ArrowLeft size={14} /> Back to home
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: March 19, 2026</p>

        <div className="prose prose-gray prose-sm max-w-none [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:text-gray-600 [&_p]:leading-relaxed [&_ul]:text-gray-600 [&_li]:leading-relaxed">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using CheckSync Pro (the &ldquo;Service&rdquo;), operated by iTax Hub, you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            CheckSync Pro is an AI-powered check reconciliation platform that allows users to upload check images, extract data using optical character recognition (OCR), and match extracted data against accounting software transactions (e.g., QuickBooks Online, Xero, Sage, Zoho).
          </p>

          <h2>3. Account Registration</h2>
          <p>To use the Service, you must:</p>
          <ul>
            <li>Be at least 18 years old</li>
            <li>Provide accurate and complete registration information</li>
            <li>Maintain the security of your account credentials</li>
            <li>Notify us immediately of any unauthorized access</li>
          </ul>
          <p>
            You are responsible for all activity that occurs under your account.
          </p>

          <h2>4. Subscription Plans and Billing</h2>
          <p>
            The Service is offered under tiered subscription plans (Starter, Professional, Enterprise). Pricing is as listed on our website at the time of purchase. All plans include a 14-day free trial. After the trial period, your selected payment method will be charged monthly unless you cancel before the trial ends.
          </p>
          <ul>
            <li>Subscriptions renew automatically each billing cycle</li>
            <li>You may cancel at any time; cancellation takes effect at the end of the current billing period</li>
            <li>Refunds are not provided for partial billing periods</li>
            <li>We reserve the right to change pricing with 30 days&apos; notice</li>
          </ul>

          <h2>5. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose</li>
            <li>Upload content that infringes on intellectual property rights</li>
            <li>Attempt to gain unauthorized access to the Service or its systems</li>
            <li>Reverse engineer, decompile, or disassemble the Service</li>
            <li>Use the Service to process fraudulent or forged financial documents</li>
            <li>Resell access to the Service without written authorization</li>
          </ul>

          <h2>6. Data Ownership</h2>
          <p>
            You retain all ownership rights to the data you upload to the Service, including check images, extracted data, and reconciliation results. We do not claim ownership of your content. By using the Service, you grant us a limited license to process your data solely for the purpose of providing the Service.
          </p>

          <h2>7. AI Processing Disclaimer</h2>
          <p>
            The Service uses artificial intelligence for OCR extraction and transaction matching. While we strive for high accuracy (98.7%+), AI-generated results may contain errors. You are responsible for reviewing and verifying all extracted data and reconciliation matches before finalizing them in your accounting records.
          </p>

          <h2>8. Third-Party Integrations</h2>
          <p>
            The Service integrates with third-party accounting platforms. Your use of those platforms is governed by their respective terms of service. We are not responsible for the availability, accuracy, or security of third-party services.
          </p>

          <h2>9. Service Availability</h2>
          <p>
            We aim to maintain 99.9% uptime but do not guarantee uninterrupted access. We may perform scheduled maintenance with advance notice. We are not liable for downtime caused by factors beyond our control.
          </p>

          <h2>10. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, iTax Hub and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, arising from your use of the Service.
          </p>
          <p>
            Our total liability for any claim arising from the Service shall not exceed the amount you paid us in the 12 months preceding the claim.
          </p>

          <h2>11. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless iTax Hub from any claims, losses, or damages arising from your use of the Service, violation of these Terms, or infringement of any third-party rights.
          </p>

          <h2>12. Termination</h2>
          <p>
            We may suspend or terminate your account if you violate these Terms. Upon termination, your right to use the Service ceases immediately. You may export your data within 30 days of termination, after which it may be permanently deleted.
          </p>

          <h2>13. Governing Law</h2>
          <p>
            These Terms are governed by and construed in accordance with the laws of the State of California, without regard to conflict of law principles.
          </p>

          <h2>14. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you of material changes via email or through the Service at least 30 days before they take effect. Continued use of the Service after changes constitutes acceptance.
          </p>

          <h2>15. Contact</h2>
          <p>
            For questions about these Terms, contact us at{' '}
            <a href="mailto:legal@itaxhub.com" className="text-blue-600 hover:underline">legal@itaxhub.com</a>.
          </p>
        </div>
      </main>
    </div>
  );
}
