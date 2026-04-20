import styles from './page.module.css';
import Link from 'next/link';

export default function Home() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>AppraisalPro</div>
        <nav className={styles.nav}>
          <Link href="#features" className={styles.navLink}>Features</Link>
          <Link href="#pricing" className={styles.navLink}>Pricing</Link>
        </nav>
        <div className={styles.authButtons}>
          <Link href="/login" className={styles.btnText}>Sign In</Link>
          <Link href="/register" className={styles.btnPrimary}>Get Started</Link>
        </div>
      </header>

      <main className={styles.hero}>
        <div className={styles.glowPattern}></div>
        <h1 className={styles.title}>
          Modern property inspections, <br />
          <span className={styles.highlight}>synced securely</span> to the cloud.
        </h1>
        <p className={styles.description}>
          AppraisalPro empowers appraisers with responsive sketching, offline mobile data entry, and seamless multi-device synchronization. Write reports faster.
        </p>
        <div className={styles.ctaGroup}>
          <Link href="/register" className={styles.btnLarge}>Start Free Trial</Link>
          <Link href="#features" className={styles.btnSecondary}>Watch Demo</Link>
        </div>
      </main>

      <section id="features" className={styles.features}>
        <div className={styles.featureCard}>
          <h3 className={styles.featureTitle}>Offline Mobile App</h3>
          <p className={styles.featureText}>Fully functional native iOS and Android apps. Collect photos and sketched plans directly in the field without an internet connection.</p>
        </div>
        <div className={styles.featureCard}>
          <h3 className={styles.featureTitle}>Instant Cloud Sync</h3>
          <p className={styles.featureText}>The moment you connect to Wi-Fi, your data syncs securely to our DigitalOcean enterprise infrastructure. Accessible instantly on your desktop.</p>
        </div>
        <div className={styles.featureCard}>
          <h3 className={styles.featureTitle}>Advanced Sketching</h3>
          <p className={styles.featureText}>Create professional-grade floorplans on site. Snap-to-grid, customizable rooms, and perfect multi-story handling designed for speed.</p>
        </div>
      </section>
    </div>
  );
}
