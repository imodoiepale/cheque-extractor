import { LegalShell } from '@/components/landing/LegalShell';

export const metadata = {
  title: 'End User License Agreement | Kyriq',
  description: 'End User License Agreement for Kyriq',
};

export default function EULAPage() {
  return (
    <LegalShell title="End User License Agreement" updated="March 2, 2026">
      <section>
        <h2>1. License Grant</h2>
        <p>
          Subject to your compliance with this End User License Agreement ("EULA") and our Terms of Service, Cheque Extractor grants you a limited, non-exclusive, non-transferable, revocable license to access and use the Cheque Extractor software application and services ("Software") solely for your internal business purposes.
        </p>
        <p>
          This license permits you to:
        </p>
        <ul>
          <li>Access the Software through supported web browsers and devices</li>
          <li>Upload and process cheque images and financial documents</li>
          <li>Extract data using our OCR and AI technology</li>
          <li>Integrate with your QuickBooks Online account</li>
          <li>Store and manage your processed data within the Software</li>
        </ul>
      </section>

      <section>
        <h2>2. License Restrictions</h2>
        <p>
          You agree NOT to:
        </p>
        <ul>
          <li><strong>Reverse Engineer:</strong> Decompile, disassemble, reverse engineer, or attempt to derive the source code of the Software</li>
          <li><strong>Modify:</strong> Modify, adapt, translate, or create derivative works based on the Software</li>
          <li><strong>Copy:</strong> Copy, reproduce, or duplicate the Software except as expressly permitted</li>
          <li><strong>Distribute:</strong> Rent, lease, lend, sell, sublicense, or distribute the Software to third parties</li>
          <li><strong>Remove Notices:</strong> Remove, alter, or obscure any proprietary notices, labels, or marks on the Software</li>
          <li><strong>Circumvent:</strong> Bypass, disable, or circumvent any security features or access controls</li>
          <li><strong>Competitive Use:</strong> Use the Software to develop competing products or services</li>
          <li><strong>Automated Access:</strong> Use bots, scrapers, or automated tools to access the Software without permission</li>
        </ul>
      </section>

      <section>
        <h2>3. OCR and AI Technology Disclaimers</h2>
        
        <div>
          <h3>IMPORTANT ACCURACY DISCLAIMER</h3>
          <p>
            The Software uses Optical Character Recognition (OCR) and Artificial Intelligence (AI) technology to extract data from cheque images and financial documents. While we strive for high accuracy, you acknowledge and agree that:
          </p>
          <ul>
            <li><strong>No Guarantee of Accuracy:</strong> OCR and AI extraction is NOT 100% accurate and errors WILL occur</li>
            <li><strong>Human Review Required:</strong> You MUST review and verify all extracted data before using it for accounting, financial, or business purposes</li>
            <li><strong>Image Quality Dependency:</strong> Accuracy depends on image quality, clarity, handwriting legibility, and document condition</li>
            <li><strong>No Liability for Errors:</strong> We are NOT liable for any errors, omissions, or inaccuracies in OCR extraction</li>
            <li><strong>User Responsibility:</strong> Final accounting decisions and data accuracy are YOUR sole responsibility</li>
          </ul>
        </div>

        <h3>3.1 Factors Affecting Accuracy</h3>
        <p>
          OCR accuracy may be affected by:
        </p>
        <ul>
          <li>Poor image quality, low resolution, or blurry photos</li>
          <li>Handwritten text or unusual fonts</li>
          <li>Damaged, torn, or faded cheques</li>
          <li>Shadows, glare, or poor lighting in images</li>
          <li>Skewed, rotated, or distorted images</li>
          <li>Non-standard cheque formats or foreign languages</li>
          <li>Overlapping text or complex backgrounds</li>
        </ul>

        <h3>3.2 Best Practices</h3>
        <p>
          To maximize accuracy:
        </p>
        <ul>
          <li>Upload high-resolution images (minimum 300 DPI recommended)</li>
          <li>Ensure good lighting and minimal shadows</li>
          <li>Capture the entire cheque with all four corners visible</li>
          <li>Keep the cheque flat and avoid wrinkles or folds</li>
          <li>Use a neutral background (white or light-colored)</li>
          <li>Always review confidence scores and manually verify low-confidence extractions</li>
        </ul>
      </section>

      <section>
        <h2>4. Financial and Accounting Disclaimers</h2>
        
        <div>
          <h3>NOT PROFESSIONAL ADVICE</h3>
          <p>
            The Software is a DATA ENTRY TOOL ONLY. It is NOT:
          </p>
          <ul>
            <li>Professional accounting, bookkeeping, or tax advice</li>
            <li>A substitute for qualified accountants or financial professionals</li>
            <li>A guarantee of compliance with accounting standards or regulations</li>
            <li>A validation or certification of financial accuracy</li>
            <li>A replacement for human judgment in financial decisions</li>
          </ul>
        </div>

        <h3>4.1 User Responsibilities</h3>
        <p>
          You are solely responsible for:
        </p>
        <ul>
          <li><strong>Data Accuracy:</strong> Verifying all extracted data before use in accounting records</li>
          <li><strong>Compliance:</strong> Ensuring compliance with applicable accounting standards (GAAP, IFRS, etc.)</li>
          <li><strong>Tax Obligations:</strong> Meeting all tax reporting and filing requirements</li>
          <li><strong>Financial Decisions:</strong> All business and financial decisions based on the data</li>
          <li><strong>Record Keeping:</strong> Maintaining proper financial records and backups</li>
          <li><strong>Professional Consultation:</strong> Consulting qualified professionals when needed</li>
        </ul>

        <h3>4.2 No Financial Liability</h3>
        <p>
          We are NOT liable for any financial losses, tax penalties, audit issues, accounting errors, or business decisions resulting from your use of the Software or reliance on extracted data.
        </p>
      </section>

      <section>
        <h2>5. QuickBooks Integration Limitations</h2>
        
        <h3>5.1 Third-Party Service</h3>
        <p>
          QuickBooks Online is a third-party service provided by Intuit Inc. You acknowledge that:
        </p>
        <ul>
          <li>We do not control QuickBooks Online availability, performance, or functionality</li>
          <li>QuickBooks integration depends on Intuit's API, which may change without notice</li>
          <li>We are not responsible for QuickBooks service outages or data issues</li>
          <li>Your use of QuickBooks is subject to Intuit's terms and policies</li>
        </ul>

        <h3>5.2 Data Synchronization</h3>
        <p>
          Regarding data synced to QuickBooks:
        </p>
        <ul>
          <li><strong>Review Before Sync:</strong> You MUST review all data before syncing to QuickBooks</li>
          <li><strong>No Automatic Undo:</strong> Once synced, data becomes part of your QuickBooks records and cannot be automatically undone</li>
          <li><strong>Duplicate Detection:</strong> While we provide duplicate detection, you are responsible for preventing duplicate entries</li>
          <li><strong>Data Integrity:</strong> We are not liable for data corruption, loss, or errors in QuickBooks</li>
          <li><strong>Backup Responsibility:</strong> You should maintain regular backups of your QuickBooks data</li>
        </ul>

        <h3>5.3 API Limitations</h3>
        <p>
          QuickBooks API has rate limits and restrictions that may affect sync speed or availability. We are not liable for delays or failures caused by API limitations.
        </p>
      </section>

      <section>
        <h2>6. Data Security and Privacy</h2>
        
        <h3>6.1 Security Measures</h3>
        <p>
          We implement industry-standard security measures including:
        </p>
        <ul>
          <li>TLS 1.3 encryption for data in transit</li>
          <li>AES-256 encryption for data at rest</li>
          <li>Encrypted storage of OAuth tokens and credentials</li>
          <li>Regular security audits and vulnerability assessments</li>
          <li>Access controls and authentication mechanisms</li>
        </ul>

        <h3>6.2 No Absolute Security</h3>
        <div>
          <p>
            <strong>IMPORTANT:</strong> No system is 100% secure. While we implement strong security measures, we cannot guarantee absolute security against all threats. You acknowledge that you use the Software at your own risk.
          </p>
        </div>

        <h3>6.3 User Security Responsibilities</h3>
        <p>
          You are responsible for:
        </p>
        <ul>
          <li>Maintaining the confidentiality of your account credentials</li>
          <li>Using strong, unique passwords</li>
          <li>Enabling two-factor authentication when available</li>
          <li>Promptly reporting any security breaches or unauthorized access</li>
          <li>Securing your devices and network connections</li>
        </ul>

        <h3>6.4 Data Privacy</h3>
        <p>
          Our collection, use, and protection of your data is governed by our Privacy Policy, which is incorporated into this EULA by reference. Please review our Privacy Policy at /legal/privacy.
        </p>
      </section>

      <section>
        <h2>7. Intellectual Property Rights</h2>
        
        <h3>7.1 Our Ownership</h3>
        <p>
          The Software, including all code, algorithms, designs, interfaces, documentation, and related materials, is the exclusive property of Cheque Extractor and is protected by:
        </p>
        <ul>
          <li>Copyright laws</li>
          <li>Trademark laws</li>
          <li>Trade secret laws</li>
          <li>Patent laws (where applicable)</li>
          <li>International intellectual property treaties</li>
        </ul>

        <h3>7.2 Your Content</h3>
        <p>
          You retain all ownership rights to cheque images, financial documents, and data you upload. By uploading content, you grant us a limited license to process, store, and display it back to you as necessary to provide the Software functionality.
        </p>

        <h3>7.3 Trademarks</h3>
        <p>
          "Cheque Extractor" and related logos are our trademarks. You may not use our trademarks without prior written permission.
        </p>
      </section>

      <section>
        <h2>8. Warranty Disclaimers</h2>
        
        <div>
          <p>
            <strong>THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND.</strong>
          </p>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
          </p>
          <ul>
            <li><strong>Merchantability:</strong> The Software is fit for any particular purpose</li>
            <li><strong>Accuracy:</strong> OCR extraction will be error-free or accurate</li>
            <li><strong>Availability:</strong> The Software will be uninterrupted or error-free</li>
            <li><strong>Security:</strong> The Software is completely secure from all threats</li>
            <li><strong>Compatibility:</strong> The Software will work with all systems or browsers</li>
            <li><strong>Results:</strong> Use of the Software will achieve any specific outcome</li>
            <li><strong>Non-Infringement:</strong> Use will not infringe third-party rights</li>
          </ul>
        </div>

        <p>
          Some jurisdictions do not allow the exclusion of implied warranties, so some of the above exclusions may not apply to you. In such cases, warranties are limited to the minimum required by law.
        </p>
      </section>

      <section>
        <h2>9. Limitation of Liability</h2>
        
        <div>
          <p>
            <strong>TO THE MAXIMUM EXTENT PERMITTED BY LAW:</strong>
          </p>
          <p>
            IN NO EVENT SHALL CHEQUE EXTRACTOR, ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR:
          </p>
          <ul>
            <li>ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES</li>
            <li>LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITIES</li>
            <li>BUSINESS INTERRUPTION OR LOSS OF USE</li>
            <li>ERRORS IN OCR EXTRACTION OR DATA PROCESSING</li>
            <li>FINANCIAL LOSSES RESULTING FROM ACCOUNTING ERRORS</li>
            <li>DAMAGE TO REPUTATION OR GOODWILL</li>
            <li>COST OF SUBSTITUTE SERVICES</li>
            <li>THIRD-PARTY CLAIMS OR ACTIONS</li>
          </ul>
          <p>
            THIS LIMITATION APPLIES REGARDLESS OF THE LEGAL THEORY (CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE) AND EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
          <p>
            <strong>OUR TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE GREATER OF:</strong>
          </p>
          <ul>
            <li>The amount you paid us in the 12 months preceding the claim, OR</li>
            <li>$100 USD</li>
          </ul>
        </div>

        <p>
          Some jurisdictions do not allow the limitation or exclusion of liability for incidental or consequential damages, so the above limitations may not apply to you.
        </p>
      </section>

      <section>
        <h2>10. Updates and Modifications</h2>
        
        <h3>10.1 Software Updates</h3>
        <p>
          We may update, modify, or discontinue features of the Software at any time without notice. Updates may:
        </p>
        <ul>
          <li>Add new features or functionality</li>
          <li>Remove or change existing features</li>
          <li>Fix bugs or improve performance</li>
          <li>Update security measures</li>
          <li>Modify user interfaces or workflows</li>
        </ul>

        <h3>10.2 Automatic Updates</h3>
        <p>
          The Software may automatically download and install updates. You consent to such automatic updates as part of your use of the Software.
        </p>

        <h3>10.3 No Obligation to Maintain Features</h3>
        <p>
          We have no obligation to maintain, support, or continue offering any particular feature or functionality. Features may be deprecated or removed at our discretion.
        </p>
      </section>

      <section>
        <h2>11. Term and Termination</h2>
        
        <h3>11.1 License Term</h3>
        <p>
          This license is effective from the date you first access the Software and continues until terminated by either party.
        </p>

        <h3>11.2 Termination by You</h3>
        <p>
          You may terminate this license at any time by discontinuing use of the Software and deleting your account.
        </p>

        <h3>11.3 Termination by Us</h3>
        <p>
          We may terminate or suspend your license immediately if:
        </p>
        <ul>
          <li>You violate this EULA or our Terms of Service</li>
          <li>Your subscription payment fails or is past due</li>
          <li>We suspect fraudulent, illegal, or abusive activity</li>
          <li>Required by law or legal process</li>
          <li>We discontinue the Software (with reasonable notice)</li>
        </ul>

        <h3>11.4 Effect of Termination</h3>
        <p>
          Upon termination:
        </p>
        <ul>
          <li>Your license to use the Software immediately ends</li>
          <li>You must cease all use of the Software</li>
          <li>You may export your data within 90 days</li>
          <li>We may delete your data after 90 days</li>
          <li>Provisions regarding disclaimers, limitations of liability, and intellectual property survive</li>
        </ul>
      </section>

      <section>
        <h2>12. Export Compliance</h2>
        <p>
          The Software may be subject to export control laws and regulations. You agree to comply with all applicable export and import laws and not to export, re-export, or transfer the Software to prohibited countries, entities, or persons.
        </p>
      </section>

      <section>
        <h2>13. Government Use</h2>
        <p>
          If you are a government entity, the Software is "commercial computer software" and "commercial computer software documentation" as defined in applicable regulations. Government use is subject to the terms of this EULA.
        </p>
      </section>

      <section>
        <h2>14. Entire Agreement</h2>
        <p>
          This EULA, together with our Terms of Service and Privacy Policy, constitutes the entire agreement between you and Cheque Extractor regarding the Software and supersedes all prior agreements, understandings, and communications.
        </p>
      </section>

      <section>
        <h2>15. Changes to This EULA</h2>
        <p>
          We may update this EULA from time to time. Material changes will be communicated via email or prominent notice in the Software. Continued use after changes become effective constitutes acceptance of the updated EULA.
        </p>
      </section>

      <section>
        <h2>16. Contact Information</h2>
        <p>
          For questions about this EULA, please contact us:
        </p>
        <div>
          <p><strong>Email:</strong> legal@chequeextractor.com</p>
          <p><strong>Support:</strong> support@chequeextractor.com</p>
        </div>
      </section>

      <section>
        <h2>Related Documents</h2>
        <ul>
          <li>
            <a href="/privacy">Privacy Policy</a>
          </li>
          <li>
            <a href="/terms">Terms of Service</a>
          </li>
        </ul>
      </section>

      <div className="mt-10 glass-panel rounded-card p-6">
        <p>
          <strong>Key Points:</strong> This EULA grants you a limited license to use the Software. OCR/AI extraction is not 100% accurate - you must verify all data. The Software is provided "as is" without warranties. We are not liable for OCR errors or financial losses. You are responsible for data accuracy and accounting decisions.
        </p>
      </div>

      <div className="mt-6 glass-panel rounded-card p-6">
        <p>
          <strong>By using the Software, you acknowledge that you have read, understood, and agree to be bound by this EULA.</strong>
        </p>
      </div>
    
    </LegalShell>
  );
}
