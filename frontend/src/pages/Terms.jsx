import { LegalDoc, H2, P, Mail } from "./Privacy";

export default function Terms() {
  return (
    <LegalDoc title="Terms of Service" version="1.0" updated="June 2026">
      <P>
        These Terms govern your use of the Teivaka Agriculture Ecosystem (TAE), operated by
        Teivaka PTE Limited ("Teivaka", "we", "us"). By creating an account or using the
        platform you agree to these Terms. If you do not agree, do not use the service.
      </P>

      <H2>1. Eligibility</H2>
      <P>You must be at least 18 years old and able to form a binding agreement to use TAE.</P>

      <H2>2. Your account</H2>
      <P>
        You are responsible for the accuracy of the information you provide and for all activity
        under your account. Keep your password secure and notify us immediately of any
        unauthorised use. Provide a permanent email — disposable addresses are not permitted.
      </P>

      <H2>3. Acceptable use</H2>
      <P>
        Use TAE only for lawful agricultural and business purposes. You may not submit false or
        misleading information, send spam, attempt to access other accounts, disrupt the service,
        or use it to break any law. Violations may result in immediate suspension or termination.
      </P>

      <H2>4. Farming intelligence (TIS) — advisory only</H2>
      <P>
        TAE may provide AI-assisted guidance, agronomic references, market information and
        reminders. This is provided for information only and is not a substitute for professional
        agronomic, veterinary, financial or legal advice. You are responsible for decisions you
        make on your farm. We do not guarantee yields, prices, or outcomes, and chemical
        withholding-period and compliance guidance must be verified against the product label and
        local regulations.
      </P>

      <H2>5. Subscriptions and trials</H2>
      <P>
        New accounts start on the BASIC plan with a 14-day trial. Plan features, limits and pricing
        may change over time; we will give reasonable notice of material changes. Bank-evidence and
        compliance documents are generated from the records you enter — their accuracy depends on
        the data you provide.
      </P>

      <H2>6. Your content and data</H2>
      <P>
        You retain ownership of the records you enter. You grant us the limited rights needed to
        store, process and display that data to operate the service for you. Our handling of your
        personal data is described in our Privacy Policy.
      </P>

      <H2>7. Intellectual property</H2>
      <P>
        The TAE platform, software, design and content (excluding your own data) are owned by
        Teivaka and protected by law. You may not copy, resell, reverse-engineer or create derivative
        works without our written permission.
      </P>

      <H2>8. Termination</H2>
      <P>
        You may close your account at any time. We may suspend or terminate access for breach of
        these Terms or to protect the platform and its users. On termination, your right to use the
        service ends; certain records may be retained as described in the Privacy Policy.
      </P>

      <H2>9. Disclaimers and limitation of liability</H2>
      <P>
        The service is provided "as is" without warranties of any kind to the fullest extent
        permitted by law. To the extent permitted by law, Teivaka is not liable for indirect or
        consequential losses, or for losses arising from farming decisions, third-party services,
        or events beyond our reasonable control.
      </P>

      <H2>10. Changes and governing law</H2>
      <P>
        We may update these Terms; material changes will be notified in-app or by email. These Terms
        are governed by the laws of the Republic of Fiji.
      </P>

      <H2>11. Contact</H2>
      <P>Questions about these Terms? Email us at <Mail />.</P>
    </LegalDoc>
  );
}
